// Simple BPE-like tokenizer implementation for fallback
class SimpleBPE {
  constructor() {
    // Basic BPE-like patterns
    this.patterns = [
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
  }

  encode(text) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Store the original text for reconstruction
    this.lastText = text;
    this.lastTokens = this.splitText(text);
    
    // Convert to token IDs for consistency with transformers.js
    return this.lastTokens.map(token => this.getTokenId(token));
  }
  
  splitText(text) {
    let tokens = [text];
    
    // Apply BPE-like splitting
    for (const pattern of this.patterns) {
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
    
    // Filter out empty tokens but preserve spaces
    return tokens
      .filter(token => token && token.length > 0)
      .map(token => {
        // Only trim non-space tokens
        if (/\s/.test(token)) {
          return token; // Keep spaces as-is
        } else {
          return token.trim();
        }
      })
      .filter(token => token.length > 0);
  }
  
  getTokenId(token) {
    // Create a simple hash-based token ID
    // This simulates what a real tokenizer would return
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Make sure it's positive and in a reasonable range
    return Math.abs(hash) % 50000; // Simulate a 50k vocabulary
  }
  
  decode(tokenIds) {
    // For SimpleBPE, we can't really decode back to original tokens
    // since we don't store the mapping. This is a limitation of the fallback.
    return tokenIds.map(id => `[token_${id}]`).join('');
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimpleBPE;
} else {
  window.SimpleBPE = SimpleBPE;
}

// For testing in Node.js
if (typeof global !== 'undefined') {
  global.SimpleBPE = SimpleBPE;
}
