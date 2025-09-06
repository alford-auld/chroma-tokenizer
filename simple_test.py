#!/usr/bin/env python3
"""
Simple test to verify tokenization is working correctly.
"""

import math
from transformers import AutoTokenizer

def test_tokenization():
    """Test tokenization with various examples."""
    print("🧪 Testing Tokenization")
    print("=" * 50)
    
    # Load tokenizer
    try:
        tokenizer = AutoTokenizer.from_pretrained('gpt2')
        print(f"✅ Tokenizer loaded successfully!")
        print(f"Vocabulary size: {tokenizer.vocab_size}")
    except Exception as e:
        print(f"❌ Failed to load tokenizer: {e}")
        return
    
    # Test cases
    test_cases = [
        "Hello world!",
        "This is a test.",
        "Test Page for Text Token Colorizer Extension",
        "Medium Complexity Text",
        "The quick brown fox jumps over the lazy dog.",
        "This extraordinarily sophisticated and linguistically intricate paragraph demonstrates the remarkable capabilities of natural language processing systems."
    ]
    
    print("\n📊 Tokenization Results:")
    print("-" * 50)
    
    for text in test_cases:
        tokens = tokenizer.encode(text)
        decoded_tokens = [tokenizer.decode([t]) for t in tokens]
        
        print(f"\nInput: '{text}'")
        print(f"Tokens: {tokens}")
        print(f"Decoded: {decoded_tokens}")
        print(f"Count: {len(tokens)} tokens")
        print(f"Reconstructed: '{tokenizer.decode(tokens)}'")
        print(f"Match: {text == tokenizer.decode(tokens)}")
        
        # Show logarithmic token IDs and color mapping
        print("Logarithmic Token IDs and Color Mapping:")
        for i, token_id in enumerate(tokens):
            log_id = math.log10(token_id + 1)
            # Calculate color based on token ID log value
            max_log_id = 5.0
            normalized = min(log_id / max_log_id, 1)
            hue = (1 - normalized) * 240  # Blue to red
            color_desc = "Blue" if normalized < 0.3 else "Green" if normalized < 0.7 else "Red"
            print(f"  {decoded_tokens[i]} -> ID: {token_id} -> log₁₀: {log_id:.2f} -> {color_desc} (hue: {hue:.0f}°)")

if __name__ == "__main__":
    test_tokenization()
