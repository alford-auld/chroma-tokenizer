#!/usr/bin/env python3
"""
Test script to verify tokenization works correctly using the same logic as the Chrome extension.
This script processes test.html and generates output.html with tokenized text.
"""

import re
import json
import math
from pathlib import Path
from transformers import AutoTokenizer
import argparse


class TokenizerTester:
    def __init__(self, model_name="gpt2"):
        """Initialize the tokenizer tester with a specific model."""
        self.model_name = model_name
        self.tokenizer = None
        self.load_tokenizer()
    
    def load_tokenizer(self):
        """Load the tokenizer model."""
        try:
            print(f"Loading tokenizer: {self.model_name}")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            print(f"✅ Tokenizer loaded successfully!")
            print(f"Vocabulary size: {self.tokenizer.vocab_size}")
            
            # Test the tokenizer
            test_text = "Hello world! This is a test."
            tokens = self.tokenizer.encode(test_text)
            print(f"Test tokenization: {tokens} ({len(tokens)} tokens)")
            print(f"Reconstructed: '{self.tokenizer.decode(tokens)}'")
            
        except Exception as e:
            print(f"❌ Failed to load tokenizer: {e}")
            print("Using fallback word-based tokenization")
            self.tokenizer = None
    
    def tokenize_text(self, text):
        """Tokenize text using the loaded tokenizer or fallback."""
        if self.tokenizer:
            try:
                # Use the tokenizer to encode the text
                tokens = self.tokenizer.encode(text)
                print(f"Tokenizing '{text}' -> {len(tokens)} tokens: {tokens[:10]}{'...' if len(tokens) > 10 else ''}")
                return tokens
            except Exception as e:
                print(f"Tokenizer error: {e}")
                return self.fallback_tokenize(text)
        else:
            return self.fallback_tokenize(text)
    
    def fallback_tokenize(self, text):
        """Fallback word-based tokenization."""
        words = text.split()
        print(f"Fallback tokenizing '{text}' -> {len(words)} words: {words}")
        return words
    
    def get_token_color(self, token_index, total_tokens):
        """Get color for a token based on its index (same logic as extension)."""
        # Use log scale for better distribution
        log_count = max(1, token_index)
        max_log_count = max(4, total_tokens)
        
        # Normalize to 0-1 range
        normalized = min(log_count / max_log_count, 1)
        
        # Create a smooth color gradient from blue (low) to red (high)
        hue = (1 - normalized) * 240  # 240 is blue, 0 is red
        saturation = 80
        lightness = 50
        
        return f"hsl({hue}, {saturation}%, {lightness}%)"
    
    def get_background_color(self, token_index, total_tokens):
        """Get background color for a token."""
        log_count = max(1, token_index)
        max_log_count = max(4, total_tokens)
        normalized = min(log_count / max_log_count, 1)
        
        opacity = normalized * 0.1
        hue = (1 - normalized) * 240
        
        return f"hsla({hue}, 20%, 90%, {opacity})"
    
    def get_token_color_from_log_id(self, log_token_id):
        """Get color based on token ID log value."""
        # Typical range: 0.0 (token ID 0) to ~4.7 (token ID ~50,000)
        max_log_id = 5.0  # Adjust based on tokenizer's vocabulary size
        normalized = min(log_token_id / max_log_id, 1)
        
        # Create a smooth color gradient from blue (low ID) to red (high ID)
        hue = (1 - normalized) * 240  # 240 is blue, 0 is red
        saturation = 80
        lightness = 50
        
        return f"hsl({hue}, {saturation}%, {lightness}%)"
    
    def get_background_color_from_log_id(self, log_token_id):
        """Get background color based on token ID log value."""
        max_log_id = 5.0
        normalized = min(log_token_id / max_log_id, 1)
        
        opacity = normalized * 0.1  # Very subtle background
        hue = (1 - normalized) * 240
        
        return f"hsla({hue}, 20%, 90%, {opacity})"
    
    def get_token_count_color_from_log_id(self, log_token_id):
        """Get superscript color based on token ID log value."""
        max_log_id = 5.0
        normalized = min(log_token_id / max_log_id, 1)
        
        # Use a more saturated color for the superscript
        hue = (1 - normalized) * 240
        saturation = 90
        lightness = 40
        
        return f"hsl({hue}, {saturation}%, {lightness}%)"
    
    def process_text_node(self, text):
        """Process a text node and return HTML with tokenized content."""
        if not text.strip():
            return text
        
        # Tokenize the text
        tokens = self.tokenize_text(text)
        
        # Create HTML spans for each token
        token_spans = []
        for i, token in enumerate(tokens):
            token_index = i + 1
            
            # Decode token if it's a token ID
            if isinstance(token, int) and self.tokenizer:
                token_text = self.tokenizer.decode([token])
                token_id = token
            else:
                token_text = str(token)
                token_id = None
            
            # Clean up the token text (remove extra spaces)
            token_text = token_text.strip()
            
            # Calculate colors based on token ID log value
            if token_id is not None:
                log_token_id = math.log10(token_id + 1)  # +1 to avoid log(0)
                color = self.get_token_color_from_log_id(log_token_id)
                bg_color = self.get_background_color_from_log_id(log_token_id)
                superscript_color = self.get_token_count_color_from_log_id(log_token_id)
                display_id = f"{log_token_id:.2f}"
                title_text = f"Token ID: {token_id}"
            else:
                # Fallback to position-based coloring
                color = self.get_token_color(token_index, len(tokens))
                bg_color = self.get_background_color(token_index, len(tokens))
                superscript_color = color
                display_id = str(token_index)
                title_text = f"Position: {token_index}"
            
            token_span = f'''<span class="individual-token" style="color: {color}; background-color: {bg_color}; padding: 1px 2px; margin: 0 1px; border-radius: 3px; display: inline-block;">
                {token_text}<sup class="token-id-superscript" style="color: {superscript_color}; font-size: 0.6em; margin-left: 1px; opacity: 0.9;" title="{title_text}">{display_id}</sup>
            </span>'''
            token_spans.append(token_span)
        
        return ''.join(token_spans)
    
    def process_html_file(self, input_file, output_file):
        """Process an HTML file and generate output with tokenized text."""
        print(f"Processing {input_file} -> {output_file}")
        
        # Read the input file
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Add CSS styles
        css_styles = """
        <style>
        .individual-token {
            display: inline-block;
            padding: 1px 2px;
            margin: 0 1px;
            border-radius: 3px;
            transition: all 0.2s ease;
        }
        .individual-token:hover {
            transform: scale(1.05);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .token-index-superscript {
            font-size: 0.6em;
            font-weight: 600;
            margin-left: 1px;
            opacity: 0.9;
            vertical-align: super;
            line-height: 0;
            position: relative;
            top: -0.2em;
        }
        .text-token-processed {
            position: relative;
            display: inline;
        }
        </style>
        """
        
        # Insert CSS before </head>
        if '</head>' in content:
            content = content.replace('</head>', css_styles + '</head>')
        else:
            content = css_styles + content
        
        # Process text content more carefully
        def process_text_content(match):
            text = match.group(1)
            if text.strip() and not text.startswith((' ', '\t', '\n')):
                # Only process meaningful text content
                return self.process_text_node(text)
            return text
        
        # Process text content more carefully - only process actual text content, not HTML
        # Find text that's between HTML tags but not inside them
        def process_text_in_html(match):
            text = match.group(1)
            # Only process if it's not HTML tags or whitespace
            if text.strip() and not text.strip().startswith(('<', '&')) and not text.strip().startswith(('body', 'font', 'max', 'margin', 'padding')):
                return self.process_text_node(text)
            return text
        
        # Process text between tags more carefully
        text_pattern = r'>([^<>]+)<'
        processed_content = re.sub(text_pattern, lambda m: '>' + process_text_in_html(m) + '<', content)
        
        # Also process specific text elements
        element_patterns = [
            (r'<title>([^<]+)</title>', r'<title>\1</title>'),
            (r'<h1[^>]*>([^<]+)</h1>', r'<h1>\1</h1>'),
            (r'<h2[^>]*>([^<]+)</h2>', r'<h2>\1</h2>'),
            (r'<h3[^>]*>([^<]+)</h3>', r'<h3>\1</h3>'),
            (r'<p[^>]*>([^<]+)</p>', r'<p>\1</p>'),
            (r'<li[^>]*>([^<]+)</li>', r'<li>\1</li>'),
        ]
        
        for pattern, replacement in element_patterns:
            def replace_func(match):
                text = match.group(1)
                if text.strip():
                    tokenized = self.process_text_node(text)
                    return replacement.replace(r'\1', tokenized)
                return replacement.replace(r'\1', text)
            
            processed_content = re.sub(pattern, replace_func, processed_content)
        
        # Write the output file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(processed_content)
        
        print(f"✅ Output written to {output_file}")
        
        # Print statistics
        total_tokens = len(self.tokenize_text(content))
        print(f"Total tokens in document: {total_tokens}")
        
        # Print some examples
        print("\n📊 Tokenization Examples:")
        examples = [
            "Hello world!",
            "This is a test.",
            "The quick brown fox jumps over the lazy dog.",
            "Medium Complexity Text"
        ]
        
        for example in examples:
            tokens = self.tokenize_text(example)
            if self.tokenizer and isinstance(tokens[0], int):
                # Decode tokens to show actual text
                decoded_tokens = [self.tokenizer.decode([t]) for t in tokens]
                print(f"'{example}' -> {len(tokens)} tokens: {decoded_tokens}")
            else:
                print(f"'{example}' -> {len(tokens)} tokens: {tokens[:5]}{'...' if len(tokens) > 5 else ''}")

def main():
    parser = argparse.ArgumentParser(description='Test tokenization on HTML files')
    parser.add_argument('--model', default='gpt2', help='Tokenizer model to use')
    parser.add_argument('--input', default='test.html', help='Input HTML file')
    parser.add_argument('--output', default='output.html', help='Output HTML file')
    
    args = parser.parse_args()
    
    # Create tester
    tester = TokenizerTester(args.model)
    
    # Process the file
    input_path = Path(args.input)
    output_path = Path(args.output)
    
    if not input_path.exists():
        print(f"❌ Input file {input_path} does not exist")
        return
    
    tester.process_html_file(input_path, output_path)
    
    print(f"\n🎉 Test completed!")
    print(f"Open {output_path} in a browser to see the tokenized text")

if __name__ == "__main__":
    main()
