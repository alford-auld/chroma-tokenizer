#!/usr/bin/env python3
"""
Local tokenizer server for Chrome extension
Provides tokenization services using the real transformers library
"""

import json
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from transformers import AutoTokenizer
import torch

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for Chrome extension

# Global tokenizer
tokenizer = None

def load_tokenizer():
    """Load the tokenizer model"""
    global tokenizer
    try:
        logger.info("Loading tokenizer...")
        # Try different model names
        model_names = [
            "openai/gpt-oss-20b",
            "gpt2",
            "gpt2-medium",
            "gpt2-large"
        ]
        
        for model_name in model_names:
            try:
                logger.info(f"Trying to load {model_name}...")
                tokenizer = AutoTokenizer.from_pretrained(model_name)
                logger.info(f"✅ Successfully loaded {model_name}")
                logger.info(f"Vocabulary size: {tokenizer.vocab_size}")
                return True
            except Exception as e:
                logger.warning(f"Failed to load {model_name}: {e}")
                continue
        
        logger.error("Failed to load any tokenizer model")
        return False
        
    except Exception as e:
        logger.error(f"Error loading tokenizer: {e}")
        return False

@app.route('/')
def index():
    """Serve the test page"""
    return send_from_directory('.', 'test_extension.html')

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "tokenizer_loaded": tokenizer is not None,
        "model_name": tokenizer.name_or_path if tokenizer else None
    })

@app.route('/tokenize', methods=['POST'])
def tokenize():
    """Tokenize text and return token IDs and texts"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        
        if not text:
            return jsonify({"error": "No text provided"}), 400
        
        if not tokenizer:
            return jsonify({"error": "Tokenizer not loaded"}), 500
        
        # Tokenize the text
        tokens = tokenizer.encode(text, add_special_tokens=False)
        
        # Get token texts
        token_texts = []
        for token_id in tokens:
            token_text = tokenizer.decode([token_id])
            token_texts.append(token_text)
        
        # Verify reconstruction
        reconstructed = ''.join(token_texts)
        
        logger.info(f"Tokenized: '{text}' -> {len(tokens)} tokens")
        logger.info(f"Tokens: {tokens[:10]}...")  # Show first 10 tokens
        logger.info(f"Reconstructed: '{reconstructed}'")
        logger.info(f"Match: {text == reconstructed}")
        
        return jsonify({
            "success": True,
            "text": text,
            "token_ids": tokens,
            "token_texts": token_texts,
            "reconstructed": reconstructed,
            "match": text == reconstructed,
            "token_count": len(tokens)
        })
        
    except Exception as e:
        logger.error(f"Error tokenizing text: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/test')
def test():
    """Test endpoint with sample text"""
    test_text = "Hello world! This is a test."
    return tokenize_text(test_text)

def tokenize_text(text):
    """Helper function to tokenize text"""
    if not tokenizer:
        return {"error": "Tokenizer not loaded"}
    
    tokens = tokenizer.encode(text, add_special_tokens=False)
    token_texts = [tokenizer.decode([token_id]) for token_id in tokens]
    reconstructed = ''.join(token_texts)
    
    return {
        "text": text,
        "token_ids": tokens,
        "token_texts": token_texts,
        "reconstructed": reconstructed,
        "match": text == reconstructed,
        "token_count": len(tokens)
    }

if __name__ == '__main__':
    # Load tokenizer on startup
    if load_tokenizer():
        logger.info("🚀 Starting tokenizer server...")
        logger.info("Server will be available at: http://localhost:5001")
        logger.info("Test endpoint: http://localhost:5001/test")
        logger.info("Health check: http://localhost:5001/health")
        app.run(host='0.0.0.0', port=5001, debug=True)
    else:
        logger.error("Failed to load tokenizer. Exiting.")
        exit(1)
