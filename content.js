// Content script for text token colorization
class TextTokenColorizer {
  constructor() {
    this.tokenizer = null;
    this.isActive = false;
    this.originalStyles = new Map();
    this.init();
  }

  async init() {
    // Load the simple BPE tokenizer first
    await this.loadSimpleBPE();
    
    // Load the main tokenizer
    await this.loadTokenizer();
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggle') {
        this.toggle();
        sendResponse({ active: this.isActive });
      } else if (request.action === 'getStatus') {
        sendResponse({ active: this.isActive });
      }
    });
  }

  async loadSimpleBPE() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('simple_bpe.js');
      script.onload = () => {
        console.log('✅ SimpleBPE tokenizer loaded');
      };
      script.onerror = () => {
        console.warn('⚠️  Failed to load SimpleBPE tokenizer');
      };
      document.head.appendChild(script);
    } catch (error) {
      console.warn('Failed to load SimpleBPE:', error);
    }
  }

  async loadTokenizer() {
    try {
      // Try multiple CDN sources for the transformers library
      const cdnSources = [
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.2/dist/transformers.min.js',
        'https://unpkg.com/@xenova/transformers@2.6.2/dist/transformers.min.js',
        'https://cdn.skypack.dev/@xenova/transformers@2.6.2'
      ];
      
      let libraryLoaded = false;
      
      for (const cdnUrl of cdnSources) {
        try {
          console.log(`Attempting to load transformers from: ${cdnUrl}`);
          
          const script = document.createElement('script');
          script.src = cdnUrl;
          script.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout loading script'));
            }, 10000); // 10 second timeout
            
            script.onload = () => {
              clearTimeout(timeout);
              resolve();
            };
            script.onerror = () => {
              clearTimeout(timeout);
              reject(new Error('Script failed to load'));
            };
            document.head.appendChild(script);
          });
          
          // Check if the library loaded
          if (window.transformers && window.transformers.AutoTokenizer) {
            console.log(`✅ Transformers library loaded from: ${cdnUrl}`);
            libraryLoaded = true;
            break;
          }
        } catch (error) {
          console.warn(`Failed to load from ${cdnUrl}:`, error.message);
        }
      }
      
      if (!libraryLoaded) {
        throw new Error('All CDN sources failed to load transformers library');
      }
      
      // Now try to load the tokenizer
      const { AutoTokenizer } = window.transformers;
      
      // Try different model names for GPT-OSS-20B
      const modelNames = [
        'gpt2', // Start with GPT-2 as it's most reliable
        'Xenova/gpt2',
        'openai/gpt-oss-20b',
        'openai/gpt-oss-20b-tokenizer'
      ];
      
      let tokenizerLoaded = false;
      for (const modelName of modelNames) {
        try {
          console.log(`Attempting to load tokenizer: ${modelName}`);
          this.tokenizer = await AutoTokenizer.from_pretrained(modelName);
          
          // Verify the tokenizer
          const vocabSize = this.tokenizer.vocab_size || this.tokenizer.get_vocab_size?.() || 'unknown';
          console.log(`✅ Tokenizer loaded successfully: ${modelName}`);
          console.log(`Vocabulary size: ${vocabSize}`);
          
          // Test the tokenizer
          const testTokens = this.tokenizer.encode('Hello world');
          console.log(`Test tokenization: [${testTokens.join(', ')}] (${testTokens.length} tokens)`);
          
          tokenizerLoaded = true;
          break;
        } catch (modelError) {
          console.warn(`Failed to load ${modelName}:`, modelError.message);
        }
      }
      
      if (!tokenizerLoaded) {
        throw new Error('All tokenizer models failed to load');
      }
      
    } catch (error) {
      console.error('Failed to load tokenizer:', error);
      this.setupFallbackTokenizer();
    }
  }

  setupFallbackTokenizer() {
    // Try to load the local BPE tokenizer first
    if (window.SimpleBPE) {
      console.log('Using local SimpleBPE tokenizer');
      this.tokenizer = new window.SimpleBPE();
    } else {
      // Fallback to a more sophisticated tokenization approach
      this.tokenizer = {
        encode: (text) => {
          // More sophisticated fallback tokenization
          // Split on word boundaries and punctuation
          const tokens = text.split(/(\s+|[.,!?;:()"'`-])/).filter(token => token.length > 0);
          console.log('Using basic fallback tokenizer - token count:', tokens.length);
          console.log('Fallback tokens:', tokens.slice(0, 10));
          return tokens;
        }
      };
    }
    console.log('⚠️  Using FALLBACK tokenizer (not proper BPE)');
    console.log('This means the transformers library failed to load');
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
      console.log('Tokenizer not ready yet, using fallback...');
      this.setupFallbackTokenizer();
    }

    this.isActive = true;
    console.log('Activating text token colorization...');
    console.log('Current tokenizer:', this.tokenizer ? 'Loaded' : 'Not loaded');
    
    // Verify which tokenizer we're using
    this.verifyTokenizer();
    
    // Test tokenizer with a simple example
    this.testTokenizer();
    
    // Extract and process all text nodes
    await this.processTextNodes();
  }

  verifyTokenizer() {
    console.log('🔍 Tokenizer Verification:');
    console.log('Tokenizer object:', this.tokenizer);
    
    if (this.tokenizer) {
      // Check if it's the fallback tokenizer
      if (this.tokenizer.encode && this.tokenizer.encode.toString().includes('split')) {
        console.log('⚠️  Using FALLBACK tokenizer (word-based)');
        console.log('This means the GPT-OSS-20B tokenizer failed to load');
      } else {
        console.log('✅ Using proper tokenizer (not fallback)');
        
        // Try to get model information
        if (this.tokenizer.model_name) {
          console.log('Model name:', this.tokenizer.model_name);
        }
        if (this.tokenizer.config) {
          console.log('Model config:', this.tokenizer.config);
        }
      }
    } else {
      console.log('❌ No tokenizer loaded');
    }
  }

  testTokenizer() {
    const testText = "Hello world! This is a test.";
    try {
      const tokens = this.tokenizer.encode(testText);
      console.log('🔍 Tokenizer Verification Test:');
      console.log('Input:', testText);
      console.log('Tokens:', tokens);
      console.log('Token count:', tokens.length);
      console.log('Reconstructed:', tokens.join(''));
      console.log('Text matches:', testText === tokens.join(''));
      
      // Additional verification
      if (this.tokenizer.vocab_size) {
        console.log('Vocabulary size:', this.tokenizer.vocab_size);
      }
      
      // Test with a known tokenization example
      const knownTest = "The quick brown fox";
      const knownTokens = this.tokenizer.encode(knownTest);
      console.log('Known test - Input:', knownTest);
      console.log('Known test - Tokens:', knownTokens);
      console.log('Known test - Count:', knownTokens.length);
      
    } catch (error) {
      console.error('Tokenizer test failed:', error);
    }
  }

  deactivate() {
    this.isActive = false;
    console.log('Deactivating text token colorization...');
    
    // Find all processed elements and restore original text nodes
    const processedElements = document.querySelectorAll('.text-token-processed');
    processedElements.forEach(wrapper => {
      // Reconstruct the original text from all child elements
      let originalText = '';
      
      // Walk through all child nodes
      const walker = document.createTreeWalker(
        wrapper,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              return NodeFilter.FILTER_ACCEPT;
            } else if (node.classList.contains('individual-token')) {
              // Get text content from token spans (excluding superscript)
              const textContent = Array.from(node.childNodes)
                .filter(child => child.nodeType === Node.TEXT_NODE)
                .map(child => child.textContent)
                .join('');
              return textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            } else if (node.classList.contains('token-whitespace')) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_REJECT;
          }
        }
      );
      
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
          originalText += node.textContent;
        } else if (node.classList.contains('individual-token')) {
          // Get text content from token spans (excluding superscript)
          const textContent = Array.from(node.childNodes)
            .filter(child => child.nodeType === Node.TEXT_NODE)
            .map(child => child.textContent)
            .join('');
          originalText += textContent;
        } else if (node.classList.contains('token-whitespace')) {
          originalText += node.textContent;
        }
      }
      
      // Create a new text node with the original text
      const textNode = document.createTextNode(originalText);
      
      // Replace the wrapper with the original text node
      wrapper.parentNode.replaceChild(textNode, wrapper);
    });
    
    this.originalStyles.clear();
  }

  async processTextNodes() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script and style elements
          const parent = node.parentElement;
          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
            return NodeFilter.FILTER_REJECT;
          }
          // Only process text nodes with meaningful content
          return node.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    console.log(`Found ${textNodes.length} text nodes to process`);

    // Process text nodes in batches to avoid blocking the UI
    const batchSize = 50;
    for (let i = 0; i < textNodes.length; i += batchSize) {
      const batch = textNodes.slice(i, i + batchSize);
      await this.processBatch(batch);
      
      // Yield control to the browser
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  async processBatch(textNodes) {
    for (const textNode of textNodes) {
      if (!this.isActive) break;
      
      const text = textNode.textContent.trim();
      if (text.length === 0) continue;

      try {
        // Tokenize the text
        const tokens = this.tokenizer.encode(text);
        
        // Debug logging
        console.log('Original text:', text);
        console.log('Tokens:', tokens);
        console.log('Token count:', tokens.length);
        
        // Create a wrapper element for all tokens
        const wrapper = document.createElement('span');
        wrapper.className = 'text-token-processed';
        
        // For debugging, let's also show the reconstructed text
        const reconstructedText = tokens.join('');
        console.log('Reconstructed text:', reconstructedText);
        console.log('Text match:', text === reconstructedText);
        
        // Process each token individually
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          const tokenId = typeof token === 'number' ? token : null;
          
          // Create the token span with actual token ID
          const tokenSpan = this.createTokenSpan(token, i + 1, tokenId);
          wrapper.appendChild(tokenSpan);
        }
        
        // Replace the text node with our wrapper
        textNode.parentNode.replaceChild(wrapper, textNode);
        
        // Store original style for restoration
        this.originalStyles.set(wrapper, {
          color: wrapper.style.color || '',
          backgroundColor: wrapper.style.backgroundColor || ''
        });
        
      } catch (error) {
        console.error('Error processing text node:', error);
      }
    }
  }

  createTokenSpan(token, tokenIndex, tokenId = null) {
    // Calculate color based on token ID log value instead of position
    let color, bgColor, superscriptColor;
    
    if (tokenId !== null && typeof tokenId === 'number') {
      // Use token ID log value for coloring
      const logTokenId = Math.log10(tokenId + 1); // +1 to avoid log(0)
      color = this.getTokenColorFromLogId(logTokenId);
      bgColor = this.getBackgroundColorFromLogId(logTokenId);
      superscriptColor = this.getTokenCountColorFromLogId(logTokenId);
    } else {
      // Fallback to position-based coloring
      color = this.getTokenColor(tokenIndex);
      bgColor = this.getBackgroundColor(tokenIndex);
      superscriptColor = this.getTokenCountColor(tokenIndex);
    }
    
    // Create the token span
    const tokenSpan = document.createElement('span');
    tokenSpan.className = 'individual-token';
    tokenSpan.textContent = token;
    tokenSpan.style.color = color;
    tokenSpan.style.backgroundColor = bgColor;
    tokenSpan.style.padding = '1px 2px';
    tokenSpan.style.margin = '0 1px';
    tokenSpan.style.borderRadius = '3px';
    tokenSpan.style.display = 'inline-block';
    
    // Create the superscript with token ID (logarithmic)
    const tokenIndexSpan = document.createElement('sup');
    tokenIndexSpan.className = 'token-id-superscript';
    
    if (tokenId !== null && typeof tokenId === 'number') {
      // Show the actual token ID with logarithmic scaling
      const logTokenId = Math.log10(tokenId + 1); // +1 to avoid log(0)
      tokenIndexSpan.textContent = logTokenId.toFixed(2);
      tokenIndexSpan.title = `Token ID: ${tokenId}`; // Show full ID on hover
    } else {
      // Fallback to position if no token ID available
      tokenIndexSpan.textContent = tokenIndex;
      tokenIndexSpan.title = `Position: ${tokenIndex}`;
    }
    
    tokenIndexSpan.style.color = superscriptColor;
    tokenIndexSpan.style.fontSize = '0.6em';
    tokenIndexSpan.style.marginLeft = '1px';
    tokenIndexSpan.style.opacity = '0.9';
    
    // Assemble the token span
    tokenSpan.appendChild(tokenIndexSpan);
    
    return tokenSpan;
  }

  getTokenColor(tokenCount) {
    // Use log scale for better distribution
    const logCount = Math.log10(Math.max(tokenCount, 1));
    const maxLogCount = 4; // Adjust based on your needs
    
    // Normalize to 0-1 range
    const normalized = Math.min(logCount / maxLogCount, 1);
    
    // Create a smooth color gradient from blue (low) to red (high)
    const hue = (1 - normalized) * 240; // 240 is blue, 0 is red
    const saturation = 80;
    const lightness = 50;
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  getBackgroundColor(tokenCount) {
    // Subtle background color based on token count
    const logCount = Math.log10(Math.max(tokenCount, 1));
    const maxLogCount = 4;
    const normalized = Math.min(logCount / maxLogCount, 1);
    
    const opacity = normalized * 0.1; // Very subtle background
    const hue = (1 - normalized) * 240;
    
    return `hsla(${hue}, 20%, 90%, ${opacity})`;
  }

  getTokenCountColor(tokenCount) {
    // Color for the superscript token count
    const logCount = Math.log10(Math.max(tokenCount, 1));
    const maxLogCount = 4;
    const normalized = Math.min(logCount / maxLogCount, 1);
    
    // Use a more saturated color for the superscript
    const hue = (1 - normalized) * 240;
    const saturation = 90;
    const lightness = 40;
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  // New methods for token ID log-based coloring
  getTokenColorFromLogId(logTokenId) {
    // Color based on token ID log value
    // Typical range: 0.0 (token ID 0) to ~4.7 (token ID ~50,000)
    const maxLogId = 5.0; // Adjust based on your tokenizer's vocabulary size
    const normalized = Math.min(logTokenId / maxLogId, 1);
    
    // Create a smooth color gradient from blue (low ID) to red (high ID)
    const hue = (1 - normalized) * 240; // 240 is blue, 0 is red
    const saturation = 80;
    const lightness = 50;
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  getBackgroundColorFromLogId(logTokenId) {
    // Background color based on token ID log value
    const maxLogId = 5.0;
    const normalized = Math.min(logTokenId / maxLogId, 1);
    
    const opacity = normalized * 0.1; // Very subtle background
    const hue = (1 - normalized) * 240;
    
    return `hsla(${hue}, 20%, 90%, ${opacity})`;
  }

  getTokenCountColorFromLogId(logTokenId) {
    // Superscript color based on token ID log value
    const maxLogId = 5.0;
    const normalized = Math.min(logTokenId / maxLogId, 1);
    
    // Use a more saturated color for the superscript
    const hue = (1 - normalized) * 240;
    const saturation = 90;
    const lightness = 40;
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
}

// Initialize the colorizer when the page loads
const colorizer = new TextTokenColorizer();
