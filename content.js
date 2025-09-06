// Content script for text token colorization
class TextTokenColorizer {
  constructor() {
    this.tokenizer = null;
    this.isActive = false;
    this.originalTexts = new Map();
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
      
      if (health.tokenizer_loaded) {
        this.tokenizer = {
          type: 'server',
          model_name: health.model_name
        };
        return;
      }
    } catch (error) {
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
          const response = await fetch('http://localhost:5001/tokenize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
          });
          
          if (!response.ok) throw new Error(`Server error: ${response.status}`);
          
          const result = await response.json();
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
        
        const wrapper = document.createElement('span');
        wrapper.className = 'text-token-processed';

        for (let i = 0; i < tokenIds.length; i++) {
          const tokenId = tokenIds[i];
          let tokenText = tokenTexts[i] || `[token_${tokenId}]`;

          if (tokenText.startsWith(' ')) {
            const spaceSpan = document.createElement('span');
            spaceSpan.textContent = ' ';
            spaceSpan.className = 'token-whitespace';
            wrapper.appendChild(spaceSpan);
            tokenText = tokenText.substring(1);
          }

          const tokenSpan = this.createTokenSpan(tokenText, i + 1, tokenId);
          wrapper.appendChild(tokenSpan);
        }

        const trailingWhitespace = text.match(/\s*$/)[0];
        if (trailingWhitespace) {
          const spaceSpan = document.createElement('span');
          spaceSpan.textContent = trailingWhitespace;
          spaceSpan.className = 'token-whitespace';
          wrapper.appendChild(spaceSpan);
        }
        
        textNode.parentNode.replaceChild(wrapper, textNode);
        
      } catch (error) {
        console.error('Error processing text node:', error);
      }
    }
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

  createTokenSpan(token, tokenIndex, tokenId = null) {
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
    
    const tokenSpan = document.createElement('span');
    tokenSpan.className = 'individual-token';
    tokenSpan.textContent = token;
    tokenSpan.style.color = color;
    tokenSpan.style.backgroundColor = 'transparent';
    tokenSpan.style.padding = '0';
    tokenSpan.style.margin = '0';
    tokenSpan.style.borderRadius = '3px';
    tokenSpan.style.display = 'inline-block';
    
    return tokenSpan;
  }

  getTokenColor(tokenCount) {
    const logCount = Math.log10(Math.max(tokenCount, 1));
    const maxLogCount = 4.0;
    const normalized = Math.min(logCount / maxLogCount, 1);
    const powerNormalized = Math.pow(normalized, 0.7);
    const lightness = 100 - (powerNormalized * 100);
    return `hsl(0, 0%, ${lightness}%)`;
  }

  getTokenColorFromLogId(logTokenId) {
    const maxLogId = 5.5;
    const normalized = Math.min(logTokenId / maxLogId, 1);
    const powerNormalized = Math.pow(normalized, 0.7);
    const lightness = 100 - (powerNormalized * 100);
    return `hsl(0, 0%, ${lightness}%)`;
  }
}

const colorizer = new TextTokenColorizer();
