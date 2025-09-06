# Tokenization Test Suite

This directory contains a test suite to verify that the tokenization logic works correctly, both in the Chrome extension and as a standalone Python script.

## Files

- `test_tokenizer.py` - Python script that processes HTML files with tokenization
- `test.html` - Input HTML file for testing
- `output.html` - Generated output file with tokenized text
- `requirements.txt` - Python dependencies
- `run_test.sh` - Shell script to run the test
- `TEST_README.md` - This file

## Quick Start

### Option 1: Run the Shell Script
```bash
./run_test.sh
```

### Option 2: Run Python Script Directly
```bash
# Install dependencies with uv
uv sync

# Run the test
uv run python test_tokenizer.py --model gpt2 --input test.html --output output.html
```

### Option 3: Test with Different Models
```bash
# Test with GPT-2 (default)
uv run python test_tokenizer.py --model gpt2

# Test with other models (if available)
uv run python test_tokenizer.py --model distilgpt2
uv run python test_tokenizer.py --model microsoft/DialoGPT-small
```

## What the Test Does

1. **Loads a Tokenizer**: Uses the same tokenization logic as the Chrome extension
2. **Processes HTML**: Reads `test.html` and tokenizes all text content
3. **Generates Output**: Creates `output.html` with:
   - Each token colored based on its position
   - Token index as superscript
   - Same styling as the Chrome extension
4. **Shows Statistics**: Displays token counts and examples

## Expected Output

The test will show:
- Tokenizer loading status
- Vocabulary size
- Test tokenization examples
- Total tokens in the document
- Tokenization examples for common phrases

## Verification

After running the test:

1. **Check Console Output**: Look for successful tokenizer loading
2. **Open output.html**: View the tokenized text in a browser
3. **Compare Results**: Verify token counts match expectations
4. **Check Colors**: Tokens should be colored blue (early) to red (late)

## Troubleshooting

### Common Issues

1. **"uv: command not found"**
   - Install uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`
   - Or: `pip install uv`

2. **"No module named 'transformers'"**
   - Run: `uv sync`

3. **"Failed to load tokenizer"**
   - Check internet connection
   - Try a different model: `--model distilgpt2`

4. **"Permission denied" for run_test.sh**
   - Run: `chmod +x run_test.sh`

### Expected Token Counts

- **"Hello world!"** → 2-3 tokens
- **"The quick brown fox"** → 4-6 tokens
- **"Medium Complexity Text"** → 3-5 tokens

If you see much higher token counts (like 16 for "following"), it indicates the tokenizer isn't working properly.

## Comparing with Chrome Extension

The Python test uses the same logic as the Chrome extension:
- Same color calculation
- Same token processing
- Same HTML structure
- Same CSS styling

This allows you to verify that the Chrome extension's tokenization is working correctly by comparing the results.
