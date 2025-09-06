// Content script for text token colorization
class TextTokenColorizer {
  constructor() {
    this.tokenizer = null;
    this.isActive = false;
    this.originalTexts = new Map(); // Store original text content
    this.init();
  }

  async init() {
    console.log('🚀 Initializing TextTokenColorizer...');
    
    // Load the simple BPE tokenizer first
    try {
      await this.loadSimpleBPE();
      console.log('✅ SimpleBPE loading completed');
    } catch (error) {
      console.error('❌ Failed to load SimpleBPE:', error);
    }
    
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
    
    console.log('✅ TextTokenColorizer initialized');
  }

  async loadSimpleBPE() {
    return new Promise((resolve, reject) => {
      try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('simple_bpe.js');
        script.onload = () => {
          console.log('✅ SimpleBPE tokenizer loaded');
          resolve();
        };
        script.onerror = () => {
          console.warn('⚠️  Failed to load SimpleBPE tokenizer');
          reject(new Error('Failed to load SimpleBPE'));
        };
        document.head.appendChild(script);
      } catch (error) {
        console.warn('Failed to load SimpleBPE:', error);
        reject(error);
      }
    });
  }

  async loadTokenizer() {
    console.log('🔍 Loading tokenizer...');
    
    // Try to connect to local server first
    try {
      const response = await fetch('http://localhost:5001/health');
      const health = await response.json();
      
      if (health.tokenizer_loaded) {
        console.log('✅ Local tokenizer server is available');
        this.tokenizer = {
          type: 'server',
          model_name: health.model_name
        };
        console.log(`✅ Using server tokenizer: ${health.model_name}`);
        return;
      }
    } catch (error) {
      console.log('⚠️  Local server not available:', error.message);
    }
    
    // Fallback to SimpleBPE if server is not available
    console.log('window.SimpleBPE available:', !!window.SimpleBPE);
    
    // Wait a bit for SimpleBPE to load, then check if it's available
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('After wait - window.SimpleBPE available:', !!window.SimpleBPE);
    
    if (window.SimpleBPE) {
      console.log('✅ SimpleBPE tokenizer is available');
      this.tokenizer = new window.SimpleBPE();
      console.log('✅ Using SimpleBPE tokenizer with proper token IDs');
      
      // Test the tokenizer
      const testText = 'Hello world!';
      const testTokens = this.tokenizer.encode(testText);
      console.log('Test tokenization:', testText, '->', testTokens);
    } else {
      console.log('⚠️  SimpleBPE not available, using basic fallback');
      this.setupFallbackTokenizer();
    }
  }

  setupFallbackTokenizer() {
    // Fallback to a more sophisticated tokenization approach
    this.tokenizer = {
      encode: (text) => {
        // More sophisticated fallback tokenization
        // Split on word boundaries and punctuation
        const tokens = text.split(/(\s+|[.,!?;:()"'`-])/).filter(token => token.length > 0);
        console.log('Using basic fallback tokenizer - token count:', tokens.length);
        console.log('Fallback tokens:', tokens.slice(0, 10));
        // Return as token IDs for consistency
        return tokens.map((token, index) => index + 1);
      }
    };
    console.log('⚠️  Using FALLBACK tokenizer (not proper BPE)');
    console.log('This means SimpleBPE failed to load');
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
      console.log('Tokenizer not ready yet, trying to load SimpleBPE...');
      if (window.SimpleBPE) {
        console.log('✅ SimpleBPE found, creating tokenizer');
        this.tokenizer = new window.SimpleBPE();
      } else {
        console.log('⚠️  SimpleBPE not found, using fallback');
        this.setupFallbackTokenizer();
      }
    }

    this.isActive = true;
    console.log('Activating text token colorization...');
    console.log('Current tokenizer:', this.tokenizer ? 'Loaded' : 'Not loaded');
    console.log('Tokenizer type:', this.tokenizer ? this.tokenizer.constructor.name : 'None');
    
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
      // Check if we're using server tokenizer
      if (this.tokenizer.type === 'server') {
        console.log('🔍 Server Tokenizer Verification Test:');
        console.log('Using server tokenizer - skipping local test');
        console.log('Server model:', this.tokenizer.model_name);
        console.log('Note: Server tokenization will be tested during text processing');
        return;
      }
      
      // For local tokenizers, test the encode method
      if (!this.tokenizer.encode) {
        console.error('Tokenizer does not have encode method');
        return;
      }
      
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
      // Get the original text node that was replaced
      const originalTextNode = Array.from(this.originalTexts.keys()).find(node => 
        wrapper.parentNode === node.parentNode
      );
      
      if (originalTextNode) {
        // Restore the exact original text
        const originalText = this.originalTexts.get(originalTextNode);
        const newTextNode = document.createTextNode(originalText);
        wrapper.parentNode.replaceChild(newTextNode, wrapper);
        this.originalTexts.delete(originalTextNode);
      } else {
        // Fallback: use textContent
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
      
      const text = textNode.textContent;
      if (text.trim().length === 0) continue;

      try {
        // Check if text contains only digits - skip tokenization
        if (/^\s*\d+\s*$/.test(text)) {
          console.log('Skipping digit-only text:', text);
          continue;
        }

        // Store original text for perfect restoration
        this.originalTexts.set(textNode, text);

        // Tokenize the text
        let tokenIds, tokenTexts;
        
        if (this.tokenizer.type === 'server') {
          // Use server-based tokenization
          const response = await fetch('http://localhost:5001/tokenize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: text })
          });
          
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
          
          const result = await response.json();
          tokenIds = result.token_ids;
          tokenTexts = result.token_texts;
          
          console.log('Server tokenization result:', result);
        } else {
          // Use local tokenization
          tokenIds = this.tokenizer.encode(text);
          
          // For fallback tokenizers, we need to reconstruct the text
          if (this.tokenizer.constructor.name === 'SimpleBPE') {
            // For SimpleBPE, use the stored tokens from the last encode call
            tokenTexts = this.tokenizer.lastTokens || this.splitTextForSimpleBPE(text);
          } else if (this.tokenizer.decode) {
            // If tokenizer has decode method, use it
            tokenTexts = tokenIds.map(id => this.tokenizer.decode([id]));
          } else {
            // Fallback: split text by spaces and punctuation
            tokenTexts = text.split(/(\s+|[.,!?;:()"'`-])/).filter(t => t.length > 0);
          }
        }
        
        // Debug logging
        console.log('Original text:', text);
        console.log('Token IDs:', tokenIds);
        console.log('Token count:', tokenIds.length);
        console.log('Token texts:', tokenTexts);
        console.log('Text match:', text === tokenTexts.join(''));
        
        // Create a wrapper element for all tokens
        const wrapper = document.createElement('span');
        wrapper.className = 'text-token-processed';

        // Process each token individually, preserving spaces
        for (let i = 0; i < tokenIds.length; i++) {
          const tokenId = tokenIds[i];
          let tokenText = tokenTexts[i] || `[token_${tokenId}]`;

          // Handle space preservation - if token starts with space, add it before the token
          if (tokenText.startsWith(' ')) {
            // Add a space element before the token
            const spaceSpan = document.createElement('span');
            spaceSpan.textContent = ' ';
            spaceSpan.className = 'token-whitespace';
            wrapper.appendChild(spaceSpan);
            
            // Remove the leading space from the token
            tokenText = tokenText.substring(1);
          }

          // Create the token span with actual token ID
          const tokenSpan = this.createTokenSpan(tokenText, i + 1, tokenId);
          wrapper.appendChild(tokenSpan);
        }

        // Handle trailing whitespace
        const trailingWhitespace = text.match(/\s*$/)[0];
        if (trailingWhitespace) {
          const spaceSpan = document.createElement('span');
          spaceSpan.textContent = trailingWhitespace;
          spaceSpan.className = 'token-whitespace';
          wrapper.appendChild(spaceSpan);
        }
        
        // Replace the text node with our wrapper
        textNode.parentNode.replaceChild(wrapper, textNode);
        
      } catch (error) {
        console.error('Error processing text node:', error);
      }
    }
  }
  
  splitTextForSimpleBPE(text) {
    // Replicate the SimpleBPE splitting logic to get token texts
    let tokens = [text];
    
    const patterns = [
      // Common word endings
      /ing\b/g,
      /ed\b/g,
      /er\b/g,
      /est\b/g,
      /ly\b/g,
      /tion\b/g,
      /sion\b/g,
      /ness\b/g,
      /ment\b/g,
      /able\b/g,
      /ible\b/g,
      // Common prefixes
      /\bun/g,
      /\bre/g,
      /\bpre/g,
      /\bdis/g,
      /\bover/g,
      /\bunder/g,
      // Punctuation
      /[.,!?;:]/g,
      /['"`]/g,
      // Spaces
      /\s+/g
    ];
    
    // Apply BPE-like splitting
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
    
    // Filter out empty tokens and clean up
    return tokens
      .filter(token => token && token.length > 0)
      .map(token => token.trim())
      .filter(token => token.length > 0);
  }

  createTokenSpan(token, tokenIndex, tokenId = null) {
        // Check if token is only digits - keep them black
        const isDigitOnly = /^\d+$/.test(token);

        // Calculate color based on token ID log value instead of position
        let color;

        if (isDigitOnly) {
          // Keep digits black (no colorization)
          color = 'black';
        } else if (tokenId !== null && typeof tokenId === 'number') {
          // Use token ID log value for coloring
          const logTokenId = Math.log10(tokenId + 1); // +1 to avoid log(0)
          color = this.getTokenColorFromLogId(logTokenId);
        } else {
          // Fallback to position-based coloring
          color = this.getTokenColor(tokenIndex);
        }
    
    // Create the token span
    const tokenSpan = document.createElement('span');
    tokenSpan.className = 'individual-token';
    tokenSpan.textContent = token;
    tokenSpan.style.color = color;
    tokenSpan.style.backgroundColor = 'transparent';
        tokenSpan.style.padding = '0';
        tokenSpan.style.margin = '0';
    tokenSpan.style.borderRadius = '3px';
    tokenSpan.style.display = 'inline-block';
    
        // No tooltips - color-only visualization
    
    return tokenSpan;
  }

  getTokenColor(tokenCount) {
    // Use log scale for better distribution - continuous scale
    const logCount = Math.log10(Math.max(tokenCount, 1));
    const maxLogCount = 4.0; // Adjust based on your needs
    const normalized = Math.min(logCount / maxLogCount, 1);
    
    // Create a smooth continuous grayscale gradient
    const powerNormalized = Math.pow(normalized, 0.7); // Makes transition more gradual
    const lightness = 100 - (powerNormalized * 100); // 100% (white) to 0% (black)
    
    return `hsl(0, 0%, ${lightness}%)`;
  }

  getBackgroundColor(tokenCount) {
    // Subtle background color based on token count - continuous scale
    const logCount = Math.log10(Math.max(tokenCount, 1));
    const maxLogCount = 4.0;
    const normalized = Math.min(logCount / maxLogCount, 1);
    
    // Create a smooth continuous background gradient
    const powerNormalized = Math.pow(normalized, 0.7); // Makes transition more gradual
    const opacity = powerNormalized * 0.1; // Very subtle background
    const lightness = 95 - (powerNormalized * 20); // Light gray to darker gray
    
    return `hsla(0, 0%, ${lightness}%, ${opacity})`;
  }


  // New methods for token ID log-based coloring
  getTokenColorFromLogId(logTokenId) {
    // Color based on token ID log value - continuous scale
    // Map log values from 0 to ~6.0 to lightness from 100% to 0%
    const maxLogId = 5.5; // Adjust based on your tokenizer's vocabulary size
    const normalized = Math.min(logTokenId / maxLogId, 1);
    
    // Create a smooth continuous grayscale gradient
    // Use a power function to make the transition more gradual
    const powerNormalized = Math.pow(normalized, 0.7); // Makes transition more gradual
    const lightness = 100 - (powerNormalized * 100); // 100% (white) to 0% (black)
    
    return `hsl(0, 0%, ${lightness}%)`;
  }

}

// Initialize the colorizer when the page loads
const colorizer = new TextTokenColorizer();
