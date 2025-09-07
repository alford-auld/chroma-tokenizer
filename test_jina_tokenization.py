#!/usr/bin/env python3
"""
Test script for proper MLM tokenization
"""

from transformers import AutoTokenizer, AutoModelForMaskedLM
import torch

def test_proper_mlm():
    """Test with models actually designed for MLM"""
    
    print("🚀 Testing Proper MLM Models")
    print("=" * 50)
    
    # Try models that are actually good at MLM
    model_names = [
        "microsoft/DialoGPT-medium",  # Good conversational model
        "roberta-base",               # Excellent MLM model
        "bert-base-cased",           # Classic MLM model
        "distilbert-base-cased",     # Smaller but decent
    ]
    
    test_sentences = [
        "Click the extension icon in your toolbar",
        "The quick brown fox jumps over the lazy dog",
        "Hello world! This is a test.",
    ]
    
    for model_name in model_names:
        try:
            print(f"\n🔧 Testing {model_name}")
            print("-" * 30)
            
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            mlm_model = AutoModelForMaskedLM.from_pretrained(model_name)
            
            print(f"✅ Loaded successfully")
            print(f"Vocabulary size: {tokenizer.vocab_size}")
            
            for sentence in test_sentences:
                print(f"\nSentence: '{sentence}'")
                
                # Tokenize
                token_ids = tokenizer.encode(sentence, add_special_tokens=False)
                token_strings = tokenizer.convert_ids_to_tokens(token_ids)
                
                # Test MLM on first word
                if len(token_ids) > 0:
                    masked_tokens = token_strings.copy()
                    masked_tokens[0] = tokenizer.mask_token
                    masked_text = tokenizer.convert_tokens_to_string(masked_tokens)
                    
                    inputs = tokenizer(masked_text, return_tensors="pt")
                    with torch.no_grad():
                        outputs = mlm_model(**inputs)
                        predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)
                        top_predictions = torch.topk(predictions[0, 1], 3)
                    
                    print(f"Masked: '{masked_text}'")
                    print("Top predictions:")
                    for j in range(3):
                        token_id = top_predictions.indices[j].item()
                        probability = top_predictions.values[j].item()
                        token_text = tokenizer.decode([token_id])
                        print(f"  {j+1}. '{token_text}' ({probability:.3f})")
            
            break  # Use first successful model
            
        except Exception as e:
            print(f"❌ Failed to load {model_name}: {e}")
            continue

def test_jina_embeddings_only():
    """Test Jina for embeddings, separate model for MLM"""
    
    print(" Testing Jina Embeddings + Separate MLM")
    print("=" * 50)
    
    try:
        # Load Jina for embeddings
        from transformers import AutoModel
        jina_tokenizer = AutoTokenizer.from_pretrained("jinaai/jina-embeddings-v4", trust_remote_code=True)
        jina_model = AutoModel.from_pretrained("jinaai/jina-embeddings-v4", trust_remote_code=True)
        
        # Load separate MLM model
        mlm_tokenizer = AutoTokenizer.from_pretrained("roberta-base")
        mlm_model = AutoModelForMaskedLM.from_pretrained("roberta-base")
        
        print("✅ Loaded Jina + RoBERTa successfully")
        
        test_sentence = "Click the extension icon in your toolbar"
        
        # Get embeddings from Jina
        jina_inputs = jina_tokenizer(test_sentence, return_tensors="pt")
        with torch.no_grad():
            jina_outputs = jina_model(**jina_inputs)
            embeddings = jina_outputs.last_hidden_state.mean(dim=1)
        
        print(f"Jina embeddings shape: {embeddings.shape}")
        
        # Get MLM predictions from RoBERTa
        mlm_inputs = mlm_tokenizer(test_sentence, return_tensors="pt")
        mlm_tokens = mlm_tokenizer.convert_ids_to_tokens(mlm_inputs['input_ids'][0])
        
        # Mask first token
        masked_tokens = mlm_tokens.copy()
        masked_tokens[1] = mlm_tokenizer.mask_token  # Position 1 for RoBERTa
        masked_text = mlm_tokenizer.convert_tokens_to_string(masked_tokens)
        
        masked_inputs = mlm_tokenizer(masked_text, return_tensors="pt")
        with torch.no_grad():
            mlm_outputs = mlm_model(**masked_inputs)
            predictions = torch.nn.functional.softmax(mlm_outputs.logits, dim=-1)
            top_predictions = torch.topk(predictions[0, 1], 3)
        
        print(f"RoBERTa MLM - Masked: '{masked_text}'")
        print("Top predictions:")
        for j in range(3):
            token_id = top_predictions.indices[j].item()
            probability = top_predictions.values[j].item()
            token_text = mlm_tokenizer.decode([token_id])
            print(f"  {j+1}. '{token_text}' ({probability:.3f})")
        
    except Exception as e:
        print(f"❌ Failed: {e}")

if __name__ == "__main__":
    test_proper_mlm()
    test_jina_embeddings_only()
