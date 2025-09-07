#!/usr/bin/env python3
"""
Local tokenizer server for Chrome extension
Provides tokenization services and masked language modeling using transformers
Hybrid approach: Jina for multilingual tokenization, RoBERTa for MLM predictions
"""

import json
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForMaskedLM, AutoModel
import torch
import torch.nn.functional as F

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for Chrome extension

# Global models
tokenizer = None
mlm_model = None
mlm_tokenizer = None
embedding_model = None

def load_models():
    """Load tokenizer, MLM model, and embedding model"""
    global tokenizer, mlm_model, mlm_tokenizer, embedding_model
    try:
        logger.info("Loading models...")
        
        # Try to load Jina for multilingual tokenization
        jina_loaded = False
        try:
            logger.info("Trying to load Jina Embeddings v4...")
            tokenizer = AutoTokenizer.from_pretrained("jinaai/jina-embeddings-v4", trust_remote_code=True)
            logger.info("✅ Jina tokenizer loaded successfully!")
            jina_loaded = True
        except Exception as e:
            logger.warning(f"Failed to load Jina tokenizer: {e}")
        
        # Load RoBERTa for MLM predictions
        try:
            logger.info("Loading RoBERTa for MLM predictions...")
            mlm_tokenizer = AutoTokenizer.from_pretrained("roberta-base")
            mlm_model = AutoModelForMaskedLM.from_pretrained("roberta-base")
            logger.info("✅ RoBERTa MLM model loaded successfully!")
        except Exception as e:
            logger.warning(f"Failed to load RoBERTa: {e}")
            # Fallback to DistilBERT
            try:
                logger.info("Falling back to DistilBERT...")
                mlm_tokenizer = AutoTokenizer.from_pretrained("distilbert-base-cased")
                mlm_model = AutoModelForMaskedLM.from_pretrained("distilbert-base-cased")
                logger.info("✅ DistilBERT MLM model loaded successfully!")
            except Exception as e2:
                logger.error(f"Failed to load DistilBERT: {e2}")
                return False
        
        # If Jina failed, use RoBERTa tokenizer for everything
        if not jina_loaded:
            logger.info("Using RoBERTa tokenizer for all tasks")
            tokenizer = mlm_tokenizer
        
        # Try to load Jina embedding model
        if jina_loaded:
            try:
                embedding_model = AutoModel.from_pretrained(
                    "jinaai/jina-embeddings-v4",
                    trust_remote_code=True,
                    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32
                )
                logger.info("✅ Jina embedding model loaded successfully!")
            except Exception as e:
                logger.warning(f"Failed to load Jina embedding model: {e}")
        
        logger.info(f"Final setup:")
        logger.info(f"  Tokenizer: {tokenizer.name_or_path}")
        logger.info(f"  MLM Model: {mlm_model.config.name_or_path}")
        logger.info(f"  MLM Tokenizer: {mlm_tokenizer.name_or_path}")
        logger.info(f"  Embedding Model: {embedding_model.name_or_path if embedding_model else 'None'}")
        logger.info(f"  Vocabulary size: {tokenizer.vocab_size}")
        logger.info(f"  MLM Vocabulary size: {mlm_tokenizer.vocab_size}")
        
        return True
        
    except Exception as e:
        logger.error(f"Error loading models: {e}")
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
        "mlm_model_loaded": mlm_model is not None,
        "mlm_tokenizer_loaded": mlm_tokenizer is not None,
        "embedding_model_loaded": embedding_model is not None,
        "model_name": tokenizer.name_or_path if tokenizer else None,
        "mlm_model_name": mlm_model.config.name_or_path if mlm_model else None,
        "case_sensitive": not getattr(tokenizer, 'do_lower_case', True) if tokenizer else None,
        "multilingual": hasattr(tokenizer, 'lang_code_to_id') or (tokenizer and 'multilingual' in tokenizer.name_or_path.lower()) if tokenizer else None
    })

@app.route('/tokenize_display', methods=['POST'])
def tokenize_display():
    """Tokenization optimized for display - uses MLM tokenizer for consistency"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        
        if not text:
            return jsonify({"error": "No text provided"}), 400
        
        # Use the MLM tokenizer for consistent tokenization
        tokens = mlm_tokenizer.tokenize(text)
        token_ids = mlm_tokenizer.convert_tokens_to_ids(tokens)
        
        # Get the reconstructed text using MLM tokenizer's native method
        reconstructed = mlm_tokenizer.convert_tokens_to_string(tokens)
        
        # Create a mapping of tokens to their positions in the reconstructed text
        token_positions = []
        current_pos = 0
        
        for i, token in enumerate(tokens):
            # Find where this token appears in the reconstructed text
            clean_token = token.replace('Ġ', '').replace('▁', '')
            if clean_token:
                start_pos = reconstructed.find(clean_token, current_pos)
                if start_pos != -1:
                    end_pos = start_pos + len(clean_token)
                    token_positions.append({
                        'token': clean_token,
                        'token_id': token_ids[i],
                        'start': start_pos,
                        'end': end_pos,
                        'original_token': token
                    })
                    current_pos = end_pos
        
        return jsonify({
            "success": True,
            "text": text,
            "reconstructed": reconstructed,
            "match": text.strip() == reconstructed.strip(),
            "token_count": len(token_positions),
            "token_positions": token_positions,
            "original_tokens": tokens,  # Add this line
            "word_level": False
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
        
        # Use the MLM tokenizer for consistent tokenization
        tokens = mlm_tokenizer.tokenize(text)
        token_ids = mlm_tokenizer.convert_tokens_to_ids(tokens)
        
        # Add special tokens for proper MLM prediction
        # RoBERTa expects <s> at the beginning and </s> at the end
        tokens_with_special = [mlm_tokenizer.bos_token] + tokens + [mlm_tokenizer.eos_token]
        token_ids_with_special = [mlm_tokenizer.bos_token_id] + token_ids + [mlm_tokenizer.eos_token_id]
        
        # Adjust masked positions to account for the added <s> token
        adjusted_positions = [pos + 1 for pos in masked_positions]
        
        # Create masked input
        masked_tokens = tokens_with_special.copy()
        masked_token_ids = token_ids_with_special.copy()
        
        for pos in adjusted_positions:
            if 0 <= pos < len(masked_tokens):
                masked_tokens[pos] = mlm_tokenizer.mask_token
                masked_token_ids[pos] = mlm_tokenizer.mask_token_id
        
        # Convert to tensor and predict
        input_ids = torch.tensor([masked_token_ids])
        
        with torch.no_grad():
            outputs = mlm_model(input_ids)
            predictions = outputs.logits[0]  # Shape: [seq_len, vocab_size]
        
        # Get predictions for each masked position
        results = []
        for i, pos in enumerate(masked_positions):
            adjusted_pos = pos + 1  # Account for <s> token
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
        
        return jsonify({
            "success": True,
            "text": text,
            "original_tokens": tokens,
            "predictions": results
        })
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/predict_context', methods=['POST'])
def predict_context():
    """Predict tokens with sentence-level context using RoBERTa"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        masked_positions = data.get('masked_positions', [])
        
        if not text:
            return jsonify({"error": "No text provided"}), 400
        
        if not mlm_model or not mlm_tokenizer:
            return jsonify({"error": "MLM model not loaded"}), 500
        
        # Add special tokens for better context
        if not text.startswith(mlm_tokenizer.cls_token):
            text = mlm_tokenizer.cls_token + " " + text
        if not text.endswith(mlm_tokenizer.sep_token):
            text = text + " " + mlm_tokenizer.sep_token
        
        # Tokenize with special tokens
        tokens = mlm_tokenizer.tokenize(text)
        
        # Adjust positions for special tokens
        adjusted_positions = [pos + 1 for pos in masked_positions]  # +1 for [CLS]
        
        # Mask the tokens
        masked_tokens = tokens.copy()
        for pos in adjusted_positions:
            if 0 <= pos < len(masked_tokens):
                masked_tokens[pos] = mlm_tokenizer.mask_token
        
        # Convert back to text
        masked_text = mlm_tokenizer.convert_tokens_to_string(masked_tokens)
        
        # Get predictions
        inputs = mlm_tokenizer(masked_text, return_tensors="pt", padding=True, truncation=True)
        
        # Move to GPU if available
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}
            mlm_model.cuda()
        
        with torch.no_grad():
            outputs = mlm_model(**inputs)
            predictions = F.softmax(outputs.logits, dim=-1)
        
        # Extract results
        results = []
        for i, pos in enumerate(adjusted_positions):
            if 0 <= pos < len(tokens):
                top_predictions = torch.topk(predictions[0, pos], 3)
                
                predictions_list = []
                for j in range(3):
                    token_id = top_predictions.indices[j].item()
                    probability = top_predictions.values[j].item()
                    token_text = mlm_tokenizer.decode([token_id])
                    
                    predictions_list.append({
                        'token': token_text,
                        'probability': probability,
                        'token_id': token_id
                    })
                
                results.append({
                    'position': masked_positions[i],  # Original position
                    'original_token': tokens[pos],
                    'predictions': predictions_list
                })
        
        return jsonify({
            "success": True,
            "text": text,
            "masked_text": masked_text,
            "predictions": results
        })
        
    except Exception as e:
        logger.error(f"Error predicting context: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/embed_text', methods=['POST'])
def embed_text():
    """Generate embeddings for text using Jina model"""
    try:
        data = request.get_json()
        texts = data.get('texts', [])
        task = data.get('task', 'text-matching')
        
        if not texts:
            return jsonify({"error": "No texts provided"}), 400
        
        if not embedding_model or not tokenizer:
            return jsonify({"error": "Embedding model not loaded"}), 500
        
        # Generate embeddings using Jina model
        if hasattr(embedding_model, 'encode_text'):
            # Jina model with encode_text method
            embeddings = embedding_model.encode_text(
                texts=texts,
                task=task,
                batch_size=32
            )
        else:
            # Fallback to standard transformer approach
            inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=True)
            
            if torch.cuda.is_available():
                inputs = {k: v.cuda() for k, v in inputs.items()}
                embedding_model.cuda()
            
            with torch.no_grad():
                outputs = embedding_model(**inputs)
                embeddings = outputs.last_hidden_state.mean(dim=1).cpu().numpy()
        
        return jsonify({
            "success": True,
            "embeddings": embeddings.tolist(),
            "dimension": embeddings.shape[1] if len(embeddings.shape) > 1 else len(embeddings),
            "task": task
        })
        
    except Exception as e:
        logger.error(f"Error generating embeddings: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/test')
def test():
    """Test endpoint with sample text"""
    test_text = "Click the extension icon in your toolbar"
    return tokenize_display_text(test_text)

@app.route('/test_mlm')
def test_mlm():
    """Test MLM endpoint with sample text"""
    if not mlm_model:
        return jsonify({"error": "MLM model not loaded"}), 500
    
    test_text = "Click the extension icon in your toolbar"
    test_positions = [0]  # Position of first word
    
    return predict_tokens_for_test(test_text, test_positions)

def tokenize_display_text(text):
    """Helper function for display tokenization"""
    if not tokenizer:
        return {"error": "Tokenizer not loaded"}
    
    # Get real tokenization
    token_ids = tokenizer.encode(text, add_special_tokens=False)
    token_strings = tokenizer.convert_ids_to_tokens(token_ids)
    
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
        logger.info("🚀 Starting hybrid tokenizer server...")
        logger.info("Server will be available at: http://localhost:5001")
        logger.info("Endpoints:")
        logger.info("  - Health check: http://localhost:5001/health")
        logger.info("  - Display tokenize: http://localhost:5001/tokenize_display")
        logger.info("  - Predict tokens: http://localhost:5001/predict_tokens")
        logger.info("  - Predict context: http://localhost:5001/predict_context")
        logger.info("  - Embed text: http://localhost:5001/embed_text")
        logger.info("  - Test MLM: http://localhost:5001/test_mlm")
        app.run(host='0.0.0.0', port=5001, debug=True)
    else:
        logger.error("Failed to load models. Exiting.")
        exit(1)
