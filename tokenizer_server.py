#!/usr/bin/env python3
"""
Local tokenizer server for Chrome extension
Provides tokenization services and masked language modeling using transformers
Uses language-specific models: RoBERTa for English, BETO Cased for Spanish, XLM-RoBERTa for others
"""

import json
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForMaskedLM
import torch
import torch.nn.functional as F
from langdetect import detect, LangDetectException

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for Chrome extension

# Global models - we'll load multiple models
models = {
    'en': {'model': None, 'tokenizer': None, 'name': 'roberta-base'},
    'es': {'model': None, 'tokenizer': None, 'name': 'dccuchile/bert-base-spanish-wwm-cased'},
    'default': {'model': None, 'tokenizer': None, 'name': 'FacebookAI/xlm-roberta-base'}
}

def load_models():
    """Load language-specific models"""
    global models
    try:
        logger.info("Loading language-specific models...")
        
        # Load English model (RoBERTa)
        try:
            logger.info("Loading RoBERTa for English...")
            models['en']['tokenizer'] = AutoTokenizer.from_pretrained("roberta-base")
            models['en']['model'] = AutoModelForMaskedLM.from_pretrained("roberta-base")
            logger.info("✅ RoBERTa English model loaded successfully!")
        except Exception as e:
            logger.warning(f"Failed to load RoBERTa: {e}")
        
        # Load Spanish model (BETO Cased)
        try:
            logger.info("Loading BETO Cased for Spanish...")
            models['es']['tokenizer'] = AutoTokenizer.from_pretrained("dccuchile/bert-base-spanish-wwm-cased")
            models['es']['model'] = AutoModelForMaskedLM.from_pretrained("dccuchile/bert-base-spanish-wwm-cased")
            logger.info("✅ BETO Cased Spanish model loaded successfully!")
        except Exception as e:
            logger.warning(f"Failed to load BETO Cased: {e}")
        
        # Load default multilingual model (XLM-RoBERTa)
        try:
            logger.info("Loading XLM-RoBERTa for other languages...")
            models['default']['tokenizer'] = AutoTokenizer.from_pretrained("FacebookAI/xlm-roberta-base")
            models['default']['model'] = AutoModelForMaskedLM.from_pretrained("FacebookAI/xlm-roberta-base")
            logger.info("✅ XLM-RoBERTa multilingual model loaded successfully!")
        except Exception as e:
            logger.warning(f"Failed to load XLM-RoBERTa: {e}")
        
        # Check if at least one model loaded
        loaded_models = [lang for lang, data in models.items() if data['model'] is not None]
        if not loaded_models:
            logger.error("No models loaded successfully!")
            return False
        
        logger.info(f"Final setup - Loaded models: {loaded_models}")
        for lang in loaded_models:
            logger.info(f"  {lang}: {models[lang]['name']} (vocab: {models[lang]['tokenizer'].vocab_size})")
        
        return True
        
    except Exception as e:
        logger.error(f"Error loading models: {e}")
        return False

def detect_language(text):
    """Detect language of the text"""
    try:
        # Clean text for better detection (remove very short texts)
        clean_text = text.strip()
        if len(clean_text) < 3:
            return 'default'
        
        # Detect language
        lang = detect(clean_text)
        
        # Map detected language to our supported models
        if lang == 'en':
            return 'en'
        elif lang == 'es':
            return 'es'
        else:
            return 'default'
            
    except LangDetectException:
        logger.warning(f"Language detection failed for text: '{text[:50]}...'")
        return 'default'
    except Exception as e:
        logger.warning(f"Language detection error: {e}")
        return 'default'

def get_model_for_text(text):
    """Get the appropriate model and tokenizer for the given text"""
    lang = detect_language(text)
    
    # Check if the language-specific model is available
    if models[lang]['model'] is not None:
        logger.info(f"Using {lang} model ({models[lang]['name']}) for text: '{text[:30]}...'")
        return models[lang]['model'], models[lang]['tokenizer'], lang
    
    # Fallback to default model
    if models['default']['model'] is not None:
        logger.info(f"Using default model ({models['default']['name']}) for text: '{text[:30]}...'")
        return models['default']['model'], models['default']['tokenizer'], 'default'
    
    # If no models available, raise error
    raise Exception("No models available")

@app.route('/')
def index():
    """Serve the test page"""
    return send_from_directory('.', 'test_extension.html')

@app.route('/health')
def health():
    """Health check endpoint"""
    loaded_models = {lang: data['model'] is not None for lang, data in models.items()}
    
    return jsonify({
        "status": "healthy",
        "models_loaded": loaded_models,
        "available_languages": list(loaded_models.keys()),
        "model_names": {lang: data['name'] for lang, data in models.items() if data['model'] is not None}
    })

@app.route('/tokenize_display', methods=['POST'])
def tokenize_display():
    """Tokenization optimized for display - properly handles punctuation and spacing"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        
        if not text:
            return jsonify({"error": "No text provided"}), 400
        
        # Get appropriate model for this text
        mlm_model, mlm_tokenizer, detected_lang = get_model_for_text(text)
        
        # Use the MLM tokenizer for consistent tokenization
        tokens = mlm_tokenizer.tokenize(text)
        token_ids = mlm_tokenizer.convert_tokens_to_ids(tokens)
        
        # Get the reconstructed text using the tokenizer's native method
        reconstructed = mlm_tokenizer.convert_tokens_to_string(tokens)
        
        # Create token positions by mapping back to the reconstructed text
        token_positions = []
        current_pos = 0
        
        for i, token in enumerate(tokens):
            # Clean the token for display
            if token.startswith('##'):  # BERT subword format
                clean_token = token[2:]  # Remove ##
                is_subword = True
            elif token.startswith('Ġ'):  # RoBERTa format
                clean_token = ' ' + token[1:]  # Replace Ġ with space
                is_subword = False
            elif token.startswith('▁'):  # SentencePiece format
                clean_token = token[1:]  # Remove ▁
                is_subword = False
            else:
                clean_token = token
                is_subword = False
            
            # Find this token in the reconstructed text
            if clean_token:
                # Simple token search - no special space handling needed
                start_pos = reconstructed.find(clean_token, current_pos)
                if start_pos != -1:
                    end_pos = start_pos + len(clean_token)
                    token_positions.append({
                        'token': clean_token,
                        'token_id': token_ids[i],
                        'start': start_pos,
                        'end': end_pos,
                        'original_token': token,
                        'is_subword': is_subword,
                        'has_space_prefix': False
                    })
                    current_pos = end_pos
        
        return jsonify({
            "success": True,
            "text": text,
            "reconstructed": reconstructed,
            "match": text.strip() == reconstructed.strip(),
            "token_count": len(token_positions),
            "token_positions": token_positions,
            "original_tokens": tokens,
            "word_level": False,
            "detected_language": detected_lang,
            "model_used": models[detected_lang]['name']
        })
        
    except Exception as e:
        logger.error(f"Tokenization error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/predict_tokens', methods=['POST'])
def predict_tokens():
    """Predict tokens at masked positions"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        masked_positions = data.get('masked_positions', [])
        
        if not text:
            return jsonify({"error": "No text provided"}), 400
        
        # Get appropriate model for this text (same as tokenize_display)
        mlm_model, mlm_tokenizer, detected_lang = get_model_for_text(text)
        
        logger.info(f"Predicting tokens for text: '{text[:50]}...' at positions: {masked_positions} using {detected_lang} model")
        
        # Use the MLM tokenizer for consistent tokenization
        tokens = mlm_tokenizer.tokenize(text)
        token_ids = mlm_tokenizer.convert_tokens_to_ids(tokens)
        
        logger.info(f"Tokenized into {len(tokens)} tokens: {tokens[:10]}...")
        
        # Add special tokens for proper MLM prediction
        # Check if tokenizer has BOS/EOS tokens
        if hasattr(mlm_tokenizer, 'bos_token') and mlm_tokenizer.bos_token:
            tokens_with_special = [mlm_tokenizer.bos_token] + tokens + [mlm_tokenizer.eos_token]
            token_ids_with_special = [mlm_tokenizer.bos_token_id] + token_ids + [mlm_tokenizer.eos_token_id]
            special_offset = 1
        else:
            # For BERT models, use CLS and SEP
            tokens_with_special = [mlm_tokenizer.cls_token] + tokens + [mlm_tokenizer.sep_token]
            token_ids_with_special = [mlm_tokenizer.cls_token_id] + token_ids + [mlm_tokenizer.sep_token_id]
            special_offset = 1
        
        # Adjust masked positions to account for the added special token
        adjusted_positions = [pos + special_offset for pos in masked_positions]
        
        # Create masked input
        masked_tokens = tokens_with_special.copy()
        masked_token_ids = token_ids_with_special.copy()
        
        for pos in adjusted_positions:
            if 0 <= pos < len(masked_tokens):
                masked_tokens[pos] = mlm_tokenizer.mask_token
                masked_token_ids[pos] = mlm_tokenizer.mask_token_id
        
        logger.info(f"Masked tokens: {masked_tokens}")
        
        # Convert to tensor and predict
        input_ids = torch.tensor([masked_token_ids])
        
        with torch.no_grad():
            outputs = mlm_model(input_ids)
            predictions = outputs.logits[0]  # Shape: [seq_len, vocab_size]
        
        # Get predictions for each masked position
        results = []
        for i, pos in enumerate(masked_positions):
            adjusted_pos = pos + special_offset  # Account for special token
            if 0 <= adjusted_pos < len(tokens_with_special):
                # Get top predictions for this position
                position_logits = predictions[adjusted_pos]
                top_indices = torch.topk(position_logits, k=5).indices
                
                # Get probability of the original token
                original_token_id = token_ids[pos]
                original_probability = torch.softmax(position_logits, dim=0)[original_token_id].item()
                
                predictions_list = []
                for idx in top_indices:
                    token_id = idx.item()
                    token_text = mlm_tokenizer.convert_ids_to_tokens([token_id])[0]
                    probability = torch.softmax(position_logits, dim=0)[idx].item()
                    
                    predictions_list.append({
                        'token': token_text,
                        'token_id': token_id,
                        'probability': probability
                    })
                
                results.append({
                    'position': pos,
                    'original_token': tokens[pos],
                    'original_probability': original_probability,
                    'predictions': predictions_list
                })
        
        logger.info(f"Generated {len(results)} predictions")
        
        return jsonify({
            "success": True,
            "text": text,
            "original_tokens": tokens,
            "predictions": results,
            "detected_language": detected_lang,
            "model_used": models[detected_lang]['name']
        })
        
    except Exception as e:
        logger.error(f"Prediction error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/test')
def test():
    """Test endpoint with sample text"""
    test_text = "Click the extension icon in your toolbar"
    return jsonify(tokenize_display_text(test_text))

@app.route('/test_mlm')
def test_mlm():
    """Test MLM endpoint with sample text"""
    if not mlm_model:
        return jsonify({"error": "MLM model not loaded"}), 500
    
    test_text = "Click the extension icon in your toolbar"
    test_positions = [0]  # Position of first word
    
    return jsonify(predict_tokens_for_test(test_text, test_positions))

def tokenize_display_text(text):
    """Helper function for display tokenization"""
    if not mlm_tokenizer:
        return {"error": "Tokenizer not loaded"}
    
    # Get real tokenization
    token_ids = mlm_tokenizer.encode(text, add_special_tokens=False)
    token_strings = mlm_tokenizer.convert_ids_to_tokens(token_ids)
    
    # Split into words (including spaces)
    import re
    words = re.findall(r'\S+', text)  # Only words, no spaces
    
    # Create display tokens
    display_tokens = []
    display_token_ids = []
    
    # For each word, find its token ID
    token_idx = 0
    for word in words:
        # Find the first token that starts this word
        word_token_id = None
        
        for i in range(token_idx, len(token_strings)):
            token_str = token_strings[i]
            
            # Clean token string
            clean_token = token_str.replace('##', '')
            
            if word.startswith(clean_token):
                word_token_id = token_ids[i]
                break
        
        if word_token_id is None:
            # Fallback - use position-based ID
            word_token_id = len(display_tokens) + 1
        
        display_tokens.append(word)
        display_token_ids.append(word_token_id)
    
    # Add spaces back between words
    final_tokens = []
    final_token_ids = []
    
    for i, word in enumerate(display_tokens):
        final_tokens.append(word)
        final_token_ids.append(display_token_ids[i])
        
        # Add space after word (except last)
        if i < len(display_tokens) - 1:
            final_tokens.append(' ')
            final_token_ids.append(-1)  # Special ID for spaces
    
    # Reconstruction
    reconstructed = ''.join(final_tokens)
    
    return {
        "text": text,
        "token_ids": final_token_ids,
        "token_texts": final_tokens,
        "real_token_ids": token_ids,  # For MLM
        "reconstructed": reconstructed,
        "match": text == reconstructed,
        "token_count": len(final_tokens)
    }

def predict_tokens_for_test(text, positions):
    """Helper function for MLM testing"""
    if not mlm_model or not mlm_tokenizer:
        return {"error": "MLM model not loaded"}
    
    tokens = mlm_tokenizer.tokenize(text)
    masked_tokens = tokens.copy()
    
    for pos in positions:
        if 0 <= pos < len(masked_tokens):
            masked_tokens[pos] = mlm_tokenizer.mask_token
    
    masked_text = mlm_tokenizer.convert_tokens_to_string(masked_tokens)
    inputs = mlm_tokenizer(masked_text, return_tensors="pt")
    
    with torch.no_grad():
        outputs = mlm_model(**inputs)
        predictions = F.softmax(outputs.logits, dim=-1)
    
    results = []
    for pos in positions:
        if 0 <= pos < len(tokens):
            top_predictions = torch.topk(predictions[0, pos+1], 3)
            
            predictions_list = []
            for j in range(3):
                token_id = top_predictions.indices[j].item()
                probability = top_predictions.values[j].item()
                token_text = mlm_tokenizer.decode([token_id])
                
                predictions_list.append({
                    'token': token_text,
                    'probability': probability
                })
            
            results.append({
                'position': pos,
                'original_token': tokens[pos],
                'predictions': predictions_list
            })
    
    return {
        "text": text,
        "masked_text": masked_text,
        "predictions": results
    }

if __name__ == '__main__':
    # Load models on startup
    if load_models():
        logger.info("🚀 Starting tokenizer server...")
        logger.info("Server will be available at: http://localhost:5001")
        logger.info("Endpoints:")
        logger.info("  - Health check: http://localhost:5001/health")
        logger.info("  - Display tokenize: http://localhost:5001/tokenize_display")
        logger.info("  - Predict tokens: http://localhost:5001/predict_tokens")
        logger.info("  - Test MLM: http://localhost:5001/test_mlm")
        app.run(host='0.0.0.0', port=5001, debug=True)
    else:
        logger.error("Failed to load models. Exiting.")
        exit(1)
