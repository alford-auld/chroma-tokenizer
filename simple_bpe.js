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
    
    // Filter out empty tokens and clean up
    return tokens
      .filter(token => token && token.length > 0)
      .map(token => token.trim())
      .filter(token => token.length > 0);
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
