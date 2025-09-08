// Content script for text token colorization with MLM predictions
class TextTokenColorizer {
  constructor() {
    this.tokenizer = null;
    this.isActive = false;
    this.originalTexts = new Map();
    this.tokenPredictor = new TokenPredictor();
    this.init();
  }

  async init() {
    await this.loadTokenizer();
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggle') {
        this.toggle();
        sendResponse({ active: this.isActive });
      } else if (request.action === 'getStatus') {
        sendResponse({ active: this.isActive });
      }
    });
  }

  async loadTokenizer() {
    // Try server first
    try {
      const response = await fetch('http://localhost:5001/health');
      const health = await response.json();
      
      // Check if any models are loaded
      const hasModels = health.models_loaded && Object.values(health.models_loaded).some(loaded => loaded);
      
      if (hasModels) {
        this.tokenizer = {
          type: 'server',
          available_languages: health.available_languages,
          model_names: health.model_names,
          mlm_available: true
        };
        return;
      }
    } catch (error) {
      console.log('Server not available, using fallback:', error);
      // Server not available, continue to fallback
    }
    
    // Load SimpleBPE fallback
    await this.loadSimpleBPE();
    
    if (window.SimpleBPE) {
      this.tokenizer = new window.SimpleBPE();
    } else {
      this.setupFallbackTokenizer();
    }
  }

  async loadSimpleBPE() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('simple_bpe.js');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load SimpleBPE'));
      document.head.appendChild(script);
    });
  }

  setupFallbackTokenizer() {
    this.tokenizer = {
      encode: (text) => {
        const tokens = text.split(/(\s+|[.,!?;:()"'`-])/).filter(token => token.length > 0);
        return tokens.map((token, index) => index + 1);
      }
    };
  }

  async toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      await this.activate();
    }
  }

  async activate() {
    if (!this.tokenizer) {
      if (window.SimpleBPE) {
        this.tokenizer = new window.SimpleBPE();
      } else {
        this.setupFallbackTokenizer();
      }
    }

    this.isActive = true;
    await this.processTextNodes();
  }

  deactivate() {
    this.isActive = false;
    this.tokenPredictor.clearAllPopups();
    
    const processedElements = document.querySelectorAll('.text-token-processed');
    processedElements.forEach(wrapper => {
      const originalTextNode = Array.from(this.originalTexts.keys()).find(node => 
        wrapper.parentNode === node.parentNode
      );
      
      if (originalTextNode) {
        const originalText = this.originalTexts.get(originalTextNode);
        const newTextNode = document.createTextNode(originalText);
        wrapper.parentNode.replaceChild(newTextNode, wrapper);
        this.originalTexts.delete(originalTextNode);
      } else {
        const originalText = wrapper.textContent;
        const textNode = document.createTextNode(originalText);
        wrapper.parentNode.replaceChild(textNode, wrapper);
      }
    });
    
    this.originalTexts.clear();
  }

  async processTextNodes() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    // Process in batches
    const batchSize = 50;
    for (let i = 0; i < textNodes.length; i += batchSize) {
      const batch = textNodes.slice(i, i + batchSize);
      await this.processBatch(batch);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  async processBatch(textNodes) {
    for (const textNode of textNodes) {
      if (!this.isActive) break;
      
      const text = textNode.textContent;
      if (text.trim().length === 0) continue;

      try {
        // Skip digit-only text
        if (/^\s*\d+\s*$/.test(text)) continue;

        this.originalTexts.set(textNode, text);

        let tokenIds, tokenTexts;
        
        if (this.tokenizer.type === 'server') {
          // Use the new display tokenization endpoint for perfect text preservation
          const response = await fetch('http://localhost:5001/tokenize_display', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
          });
          
          if (!response.ok) throw new Error(`Server error: ${response.status}`);
          
          const result = await response.json();
          
          // Use the new token_positions structure
          if (result.token_positions) {
            this.processWithTokenPositions(textNode, result);
            continue;
          }
          
          // Fallback to old format
          tokenIds = result.token_ids;
          tokenTexts = result.token_texts;
        } else {
          tokenIds = this.tokenizer.encode(text);
          
          if (this.tokenizer.constructor.name === 'SimpleBPE') {
            tokenTexts = this.tokenizer.lastTokens || this.splitTextForSimpleBPE(text);
          } else if (this.tokenizer.decode) {
            tokenTexts = tokenIds.map(id => this.tokenizer.decode([id]));
          } else {
            tokenTexts = text.split(/(\s+|[.,!?;:()"'`-])/).filter(t => t.length > 0);
          }
        }
        
        // Process tokens using the old method (for non-server tokenizers or fallback)
        const wrapper = document.createElement('span');
        wrapper.className = 'text-token-processed';

        // Create token spans for each token
        tokenTexts.forEach((tokenText, index) => {
          const tokenSpan = this.createTokenSpan(tokenText, index, tokenIds[index], text);
          wrapper.appendChild(tokenSpan);
        });
        
        // Remove text-align: justify from parent elements to prevent spacing issues
        this.removeJustifyAlignment(textNode.parentNode);
        
        textNode.parentNode.replaceChild(wrapper, textNode);
        
      } catch (error) {
        console.error('Error processing text node:', error);
      }
    }
  }
  
  processWithTokenPositions(textNode, result) {
    const text = textNode.textContent;
    
    // Create wrapper and process tokens using native reconstruction
    const wrapper = document.createElement('span');
    wrapper.className = 'text-token-processed';
  
    // Use the reconstructed text and token positions
    const reconstructed = result.reconstructed;
    const tokenPositions = result.token_positions;
    
    let lastPos = 0;
    tokenPositions.forEach((tokenInfo, index) => {
      // Add any text before this token
      if (tokenInfo.start > lastPos) {
        const textSpan = document.createElement('span');
        textSpan.textContent = reconstructed.substring(lastPos, tokenInfo.start);
        textSpan.style.color = 'inherit';
        wrapper.appendChild(textSpan);
      }
      
      // Add the token span
      const tokenSpan = this.createTokenSpan(tokenInfo.token, index, tokenInfo.token_id, text);
      wrapper.appendChild(tokenSpan);
      
      lastPos = tokenInfo.end;
    });
    
    // Add any remaining text
    if (lastPos < reconstructed.length) {
      const textSpan = document.createElement('span');
      textSpan.textContent = reconstructed.substring(lastPos);
      textSpan.style.color = 'inherit';
      wrapper.appendChild(textSpan);
    }
    
    // Remove text-align: justify from parent elements to prevent spacing issues
    this.removeJustifyAlignment(textNode.parentNode);
    
    textNode.parentNode.replaceChild(wrapper, textNode);
  }

  splitTextForSimpleBPE(text) {
    let tokens = [text];
    
    const patterns = [
      /ing\b/g, /ed\b/g, /er\b/g, /est\b/g, /ly\b/g,
      /tion\b/g, /sion\b/g, /ness\b/g, /ment\b/g,
      /able\b/g, /ible\b/g, /\bun/g, /\bre/g, /\bpre/g,
      /\bdis/g, /\bover/g, /\bunder/g,
      /[.,!?;:]/g, /['"`]/g, /\s+/g
    ];
    
    for (const pattern of patterns) {
      const newTokens = [];
      for (const token of tokens) {
        if (typeof token === 'string') {
          const parts = token.split(pattern);
          const matches = token.match(pattern) || [];
          
          let result = [];
          for (let i = 0; i < parts.length; i++) {
            if (parts[i]) result.push(parts[i]);
            if (matches[i]) result.push(matches[i]);
          }
          newTokens.push(...result);
        } else {
          newTokens.push(token);
        }
      }
      tokens = newTokens;
    }
    
    return tokens
      .filter(token => token && token.length > 0)
      .map(token => token.trim())
      .filter(token => token.length > 0);
  }

  createTokenSpan(token, tokenIndex, tokenId = null, context = '') {
    const isDigitOnly = /^\d+$/.test(token);
    let color;

    if (isDigitOnly) {
      color = 'black';
    } else if (tokenId !== null && typeof tokenId === 'number') {
      const logTokenId = Math.log10(tokenId + 1);
      color = this.getTokenColorFromLogId(logTokenId);
    } else {
      color = this.getTokenColor(tokenIndex);
    }
    
    // Handle Ġ replacement more intelligently
    let displayText = token;
    if (token.startsWith('Ġ')) {
      // This token starts with a space - keep the space
      displayText = token.replace(/Ġ/g, ' ');
    } else {
      // This token doesn't start with a space - don't add one
      displayText = token.replace(/Ġ/g, '');
    }
    
    // Check if the display text contains spaces and split them
    if (displayText.includes(' ')) {
      // Create a container span to hold multiple spans
      const containerSpan = document.createElement('span');
      containerSpan.className = 'token-container';
      containerSpan.style.display = 'inline-block';
      
      // Split by spaces and create separate spans
      const parts = displayText.split(' ');
      parts.forEach((part, partIndex) => {
        if (part.length > 0) {
          // Create span for the actual token part
          const tokenSpan = document.createElement('span');
          tokenSpan.className = 'individual-token';
          tokenSpan.textContent = part;
          tokenSpan.style.color = color;
          tokenSpan.style.backgroundColor = 'transparent';
          tokenSpan.style.padding = '0';
          tokenSpan.style.margin = '0';
          tokenSpan.style.borderRadius = '3px';
          tokenSpan.style.display = 'inline-block';
          tokenSpan.style.cursor = 'pointer';
          
          // Add data attributes for prediction
          tokenSpan.dataset.tokenIndex = tokenIndex;
          tokenSpan.dataset.tokenId = tokenId;
          tokenSpan.dataset.context = context;
          tokenSpan.dataset.originalToken = token;
          
          // Add hover event listeners instead of click
          let hoverTimeout;
          tokenSpan.addEventListener('mouseenter', () => {
            tokenSpan.style.backgroundColor = 'rgba(74, 175, 80, 0.1)';
            
            // Set a small delay before showing prediction to avoid flickering
            hoverTimeout = setTimeout(() => {
              this.tokenPredictor.predictToken(tokenSpan);
            }, 300); // 300ms delay
          });
          
          tokenSpan.addEventListener('mouseleave', () => {
            tokenSpan.style.backgroundColor = 'transparent';
            
            // Clear the timeout if mouse leaves before delay
            if (hoverTimeout) {
              clearTimeout(hoverTimeout);
            }
            
            // Clear any popup for this token
            this.tokenPredictor.clearPopupForToken(tokenSpan);
          });
          
          containerSpan.appendChild(tokenSpan);
        }
        
        // Add space span if not the last part
        if (partIndex < parts.length - 1) {
          const spaceSpan = document.createElement('span');
          spaceSpan.innerHTML = '&nbsp;';  // Use &nbsp; instead of regular space
          spaceSpan.style.color = 'inherit';
          spaceSpan.className = 'token-space';
          containerSpan.appendChild(spaceSpan);
        }
      });
      
      return containerSpan;
    } else {
      // No spaces, create single span as before
      const tokenSpan = document.createElement('span');
      tokenSpan.className = 'individual-token';
      tokenSpan.textContent = displayText;
      tokenSpan.style.color = color;
      tokenSpan.style.backgroundColor = 'transparent';
      tokenSpan.style.padding = '0';
      tokenSpan.style.margin = '0';
      tokenSpan.style.borderRadius = '3px';
      tokenSpan.style.display = 'inline-block';
      tokenSpan.style.cursor = 'pointer';
      
      // Add data attributes for prediction
      tokenSpan.dataset.tokenIndex = tokenIndex;
      tokenSpan.dataset.tokenId = tokenId;
      tokenSpan.dataset.context = context;
      tokenSpan.dataset.originalToken = token;
      
      // Add hover event listeners instead of click
      let hoverTimeout;
      tokenSpan.addEventListener('mouseenter', () => {
        tokenSpan.style.backgroundColor = 'rgba(74, 175, 80, 0.1)';
        
        // Set a small delay before showing prediction to avoid flickering
        hoverTimeout = setTimeout(() => {
          this.tokenPredictor.predictToken(tokenSpan);
        }, 300); // 300ms delay
      });
      
      tokenSpan.addEventListener('mouseleave', () => {
        tokenSpan.style.backgroundColor = 'transparent';
        
        // Clear the timeout if mouse leaves before delay
        if (hoverTimeout) {
          clearTimeout(hoverTimeout);
        }
        
        // Clear any popup for this token
        this.tokenPredictor.clearPopupForToken(tokenSpan);
      });
      
      return tokenSpan;
    }
  }

  handleTokenClick(tokenSpan) {
    // Always do token prediction on click
    this.tokenPredictor.predictToken(tokenSpan);
  }

  getTokenColor(tokenCount) {
    const logCount = Math.log10(Math.max(tokenCount, 1));
    const minLogCount = 3.0;
    const maxLogCount = 4.2;
    const normalized = Math.min(Math.max(logCount, minLogCount) / maxLogCount, 1);
    // const powerNormalized = Math.pow(normalized, 0.7);
    const lightness = 100 - (normalized * 80);
    return `hsl(0, 0%, ${lightness}%)`;
  }

  getTokenColorFromLogId(logTokenId) {
    const maxLightness = 80;
    const minLogId = 2.0;
    const maxLogId = 5.2;
    const normalized = Math.min(Math.max((logTokenId - minLogId) / (maxLogId - minLogId), 0), 1);
    const lightness = maxLightness * (1 - normalized);
    return `hsl(0, 0%, ${lightness}%)`;
  }

  removeJustifyAlignment(element) {
    // Walk up the DOM tree and remove text-align: justify from parent elements
    let current = element;
    while (current && current !== document.body) {
      // Check if element has justify-related classes
      if (current.classList) {
        const hasJustifyClass = Array.from(current.classList).some(cls => 
          cls.toLowerCase().includes('justif') || 
          cls.toLowerCase().includes('justificado')
        );
        
        if (hasJustifyClass) {
          // Add a class to override justify alignment
          current.classList.add('tokenizer-override-justify');
        }
      }
      
      // Check inline styles
      if (current.style && current.style.textAlign === 'justify') {
        current.style.setProperty('text-align', 'left', 'important');
      }
      
      // Check computed styles and override with !important
      const computedStyle = window.getComputedStyle(current);
      if (computedStyle.textAlign === 'justify') {
        current.style.setProperty('text-align', 'left', 'important');
      }
      
      current = current.parentNode;
    }
  }
}

// Token Predictor Class
class TokenPredictor {
  constructor() {
    this.activePopups = new Set();
    this.loadingTokens = new Set(); // Track tokens currently being predicted
  }

  async predictToken(tokenSpan) {
    // Check if this token is already being predicted
    const tokenKey = `${tokenSpan.dataset.tokenId}-${tokenSpan.dataset.tokenIndex}`;
    if (this.loadingTokens.has(tokenKey)) {
      return; // Already predicting this token
    }
    
    // Clear any existing popups first
    this.clearAllPopups();
    
    // Show loading popup immediately
    this.showLoadingPopup(tokenSpan);
    
    // Mark this token as being predicted
    this.loadingTokens.add(tokenKey);
    
    const context = tokenSpan.dataset.context;
    const tokenIndex = parseInt(tokenSpan.dataset.tokenIndex);
    
    try {
      console.log('Predicting token:', { context, tokenIndex });
      
      // First, get the original tokenization to find the correct position
      const tokenizeResponse = await fetch('http://localhost:5001/tokenize_display', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: context })
      });
      
      if (!tokenizeResponse.ok) {
        throw new Error(`Tokenization error: ${tokenizeResponse.status}`);
      }
      
      const tokenizeResult = await tokenizeResponse.json();
      console.log('Tokenize result:', tokenizeResult);
      
      // Find the original token position for this display token
      let originalPosition = -1;
      if (tokenizeResult.token_positions && tokenIndex < tokenizeResult.token_positions.length) {
        const tokenInfo = tokenizeResult.token_positions[tokenIndex];
        console.log('Token info:', tokenInfo);
        
        // Find this token in the original tokenization
        const originalTokens = tokenizeResult.original_tokens || [];
        console.log('Original tokens:', originalTokens);
        
        for (let i = 0; i < originalTokens.length; i++) {
          if (originalTokens[i] === tokenInfo.original_token) {
            originalPosition = i;
            break;
          }
        }
      }
      
      console.log('Original position:', originalPosition);
      
      if (originalPosition === -1) {
        throw new Error('Could not find original token position');
      }
      
      // Now predict using the correct position
      const response = await fetch('http://localhost:5001/predict_tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: context,
          masked_positions: [originalPosition]
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Prediction result:', result);
      
      // Remove loading popup and show actual prediction
      this.clearPopupForToken(tokenSpan);
      
      if (result.success && result.predictions.length > 0) {
        this.showPredictionPopup(tokenSpan, result.predictions[0]);
      } else {
        console.warn('No predictions received');
        this.showErrorPopup(tokenSpan, 'No predictions available');
      }
    } catch (error) {
      console.error('Error predicting token:', error);
      this.clearPopupForToken(tokenSpan);
      this.showErrorPopup(tokenSpan, 'Prediction failed: ' + error.message);
    } finally {
      // Remove from loading set
      this.loadingTokens.delete(tokenKey);
    }
  }

  showLoadingPopup(tokenSpan) {
    // Remove any existing popup for this token
    this.clearPopupForToken(tokenSpan);
    
    const popup = document.createElement('div');
    popup.className = 'token-prediction-popup loading';
    popup.dataset.tokenId = tokenSpan.dataset.tokenId;
    
    popup.innerHTML = `
      <div class="popup-header">
        <span class="popup-title">Loading Predictions...</span>
        <button class="close-btn">×</button>
      </div>
      <div class="popup-content">
        <div class="loading-spinner">
          <div class="spinner"></div>
          <span>Computing token predictions...</span>
        </div>
      </div>
    `;
    
    // Better positioning logic
    const rect = tokenSpan.getBoundingClientRect();
    const popupWidth = 250; // Fixed width
    const popupHeight = 100; // Estimated height for loading
    
    let left = rect.left;
    let top = rect.bottom + 5;
    
    // Adjust horizontal position if popup would go off-screen
    if (left + popupWidth > window.innerWidth) {
      left = window.innerWidth - popupWidth - 10;
    }
    
    // Adjust vertical position if popup would go off-screen
    if (top + popupHeight > window.innerHeight) {
      top = rect.top - popupHeight - 5;
    }
    
    popup.style.position = 'fixed';
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.style.zIndex = '10000';
    
    document.body.appendChild(popup);
    
    // Add event listeners
    popup.querySelector('.close-btn').addEventListener('click', () => {
      this.clearPopupForToken(tokenSpan);
    });
  }

  showPredictionPopup(tokenSpan, prediction) {
    // Remove any existing popup for this token
    this.clearPopupForToken(tokenSpan);
    
    const popup = document.createElement('div');
    popup.className = 'token-prediction-popup';
    popup.dataset.tokenId = tokenSpan.dataset.tokenId;
    
    // Clean up the original token for display - normalize spaces and special tokens
    const originalToken = tokenSpan.dataset.originalToken || '';
    const cleanOriginalToken = originalToken
      .replace(/Ġ/g, '')  // Remove RoBERTa space markers
      .replace(/▁/g, '')   // Remove SentencePiece markers
      .replace(/^ +| +$/g, '')  // Trim leading/trailing spaces
      .trim();
    
    // Get the original token's probability
    const originalProbability = prediction.original_probability || 0;
    
    // Normalize function for consistent token comparison
    const normalizeToken = (token) => {
      return token
        .replace(/Ġ/g, '')  // Remove RoBERTa space markers
        .replace(/▁/g, '')   // Remove SentencePiece markers
        .replace(/^ +| +$/g, '')  // Trim leading/trailing spaces
        .trim();
    };
    
    // Filter alternatives: probability > 5%, not current token, max 3
    const filteredPredictions = prediction.predictions
      .filter(pred => {
        const cleanPredToken = normalizeToken(pred.token);
        const cleanOriginal = normalizeToken(originalToken);
        return pred.probability > 0.05 && cleanPredToken !== cleanOriginal;
      })
      .slice(0, 3); // Limit to 3 alternatives
    
    popup.innerHTML = `
      <div class="popup-header">
        <span class="popup-title">Token Predictions</span>
        <button class="close-btn">×</button>
      </div>
      <div class="popup-content">
        <div class="current-token">
          <strong>Current:</strong> "${cleanOriginalToken}" <span class="probability">${(originalProbability * 100).toFixed(1)}%</span>
        </div>
        <div class="predictions">
          <strong>Alternatives:</strong>
          ${filteredPredictions.map((pred, index) => `
            <div class="prediction-item" data-token="${pred.token}" data-probability="${pred.probability}">
              <span class="token">${normalizeToken(pred.token)}</span>
              <span class="probability">${(pred.probability * 100).toFixed(1)}%</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    // Better positioning logic
    const rect = tokenSpan.getBoundingClientRect();
    const popupWidth = 250; // Fixed width
    const popupHeight = 150; // Estimated height
    
    let left = rect.left;
    let top = rect.bottom + 5;
    
    // Adjust horizontal position if popup would go off-screen
    if (left + popupWidth > window.innerWidth) {
      left = window.innerWidth - popupWidth - 10;
    }
    
    // Adjust vertical position if popup would go off-screen
    if (top + popupHeight > window.innerHeight) {
      top = rect.top - popupHeight - 5;
    }
    
    popup.style.position = 'fixed';
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.style.zIndex = '10000';
    
    document.body.appendChild(popup);
    
    // Add event listeners
    popup.querySelector('.close-btn').addEventListener('click', () => {
      this.clearPopupForToken(tokenSpan);
    });
  }

  showErrorPopup(tokenSpan, message) {
    const popup = document.createElement('div');
    popup.className = 'token-prediction-popup error';
    popup.innerHTML = `
      <div class="prediction-header">
        <span class="error-message">${message}</span>
        <button class="close-btn">&times;</button>
      </div>
    `;
    
    const rect = tokenSpan.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.left = rect.left + 'px';
    popup.style.top = (rect.bottom + 5) + 'px';
    popup.style.zIndex = '10000';
    
    document.body.appendChild(popup);
    this.activePopups.add(popup);
    
    popup.querySelector('.close-btn').addEventListener('click', () => {
      this.removePopup(popup);
    });
    
    setTimeout(() => this.removePopup(popup), 3000);
  }

  removePopup(popup) {
    if (popup && popup.parentNode) {
      popup.parentNode.removeChild(popup);
      this.activePopups.delete(popup);
    }
  }

  clearPopupForToken(tokenSpan) {
    const existingPopup = document.querySelector(`.token-prediction-popup[data-token-id="${tokenSpan.dataset.tokenId}"]`);
    if (existingPopup) {
      this.removePopup(existingPopup);
    }
  }

  clearAllPopups() {
    // Remove all existing prediction popups
    const existingPopups = document.querySelectorAll('.token-prediction-popup');
    existingPopups.forEach(popup => popup.remove());
    
    // Remove all existing error popups
    const existingErrors = document.querySelectorAll('.token-error-popup');
    existingErrors.forEach(error => error.remove());
  }
}

const colorizer = new TextTokenColorizer();
