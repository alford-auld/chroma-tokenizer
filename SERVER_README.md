# Tokenizer Server Setup

This setup uses a local Python server to provide real tokenization using the `transformers` library, avoiding browser security restrictions.

## Quick Start

1. **Start the server**:
   ```bash
   ./start_server.sh
   ```
   Or manually:
   ```bash
   uv add flask flask-cors
   uv run python tokenizer_server.py
   ```

2. **Load the Chrome extension**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this folder

3. **Test the extension**:
   - Open `test_extension.html` in Chrome
   - Click the extension icon and toggle it on
   - You should see proper tokenization with real token IDs

## How it works

1. **Server**: The Python server runs on `http://localhost:5000` and provides:
   - `/health` - Health check endpoint
   - `/tokenize` - Tokenize text and return token IDs and texts
   - `/test` - Test endpoint with sample text

2. **Extension**: The Chrome extension:
   - First tries to connect to the local server
   - If server is available, uses real tokenization with proper token IDs
   - If server is not available, falls back to local SimpleBPE tokenizer

## Benefits

- ✅ Real tokenization using `transformers` library
- ✅ Proper token IDs from actual tokenizers (GPT-OSS-20B, GPT-2, etc.)
- ✅ No browser security restrictions
- ✅ Reliable and fast
- ✅ Fallback to local tokenizer if server is not available

## Server Endpoints

- `GET /health` - Check if server and tokenizer are loaded
- `POST /tokenize` - Tokenize text: `{"text": "Hello world!"}`
- `GET /test` - Test with sample text
- `GET /` - Serve the test page

## Troubleshooting

If the extension shows "line numbers" instead of token IDs:
1. Make sure the server is running (`./start_server.sh`)
2. Check the browser console for connection errors
3. Verify the server is accessible at `http://localhost:5001/health`
