# Chroma Tokenizer - Text Tokenization Visualizer

A Chrome extension that extracts text from web pages, tokenizes using BPE, and provides interactive token visualization with MLM predictions. Colorizes text based on token complexity and shows alternative word suggestions on hover.

## Features

- **Text Extraction**: Automatically extracts all readable text from web pages
- **BPE Tokenization**: Uses a local BPE tokenizer to process text segments
- **Token Visualization**: Colorizes text based on token ID using a smooth gradient
  - Light gray: Low token ID (common tokens)
  - Black: High token ID (rare tokens)
- **Individual Token Display**: Shows each token separately with color-coded complexity
- **MLM Predictions**: Hover over tokens to see alternative word suggestions
  - Shows up to 3 alternative tokens with probability scores
  - Uses masked language modeling for context-aware predictions
- **Real-time Toggle**: Enable/disable colorization with a simple toggle
- **Non-intrusive**: Preserves original page functionality and styling

## Installation

### Chrome Extension
1. **Download the extension files** to a local directory
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer mode** (toggle in the top right)
4. **Click "Load unpacked"** and select the directory containing the extension files
5. **Pin the extension** to your toolbar for easy access

### MLM Prediction Server (Optional)
For MLM predictions functionality:
1. **Install Python dependencies**: `pip install -r server_requirements.txt`
2. **Start the server**: `python tokenizer_server.py`
3. **Server runs on**: `http://localhost:5001`

## Usage

1. **Navigate to any webpage** you want to analyze
2. **Click the extension icon** in your toolbar
3. **Toggle the switch** to enable text colorization
4. **Watch as text gets colorized** based on token ID:
   - Light gray tokens = low token ID (common tokens)
   - Black tokens = high token ID (rare tokens)
5. **Hover over tokens** to see MLM predictions (requires server running):
   - Shows alternative word suggestions with probability scores
   - Displays up to 3 alternatives with >5% probability
6. **Toggle off** to restore original text colors

## How It Works

1. **Text Processing**: The extension walks through all text nodes on the page
2. **Tokenization**: Each text segment is tokenized using a local BPE tokenizer
3. **Individual Processing**: Each token is processed and colorized separately
4. **Color Mapping**: Token ID is mapped to colors using a logarithmic scale
5. **Visualization**: Each token gets its own color based on complexity
6. **MLM Predictions**: On hover, sends context to local server for masked language modeling
7. **Alternative Suggestions**: Server returns alternative tokens with probability scores

## Technical Details

- **Tokenizer**: Uses local BPE tokenizer for text processing
- **Color Scale**: Logarithmic scale from light gray (low token ID) to black (high token ID)
- **MLM Server**: Python Flask server providing masked language model predictions
- **Performance**: Processes text in batches to avoid blocking the UI
- **Fallback**: Includes word-based tokenization as a fallback method
- **Local Processing**: All tokenization happens in the browser, predictions via local server

## Files Structure

```
chroma/
├── manifest.json              # Extension manifest
├── content.js                 # Main content script with tokenization and MLM
├── content.css                # Styling for colorized text and popups
├── popup.html                 # Extension popup interface
├── popup.js                   # Popup functionality
├── simple_bpe.js              # BPE tokenizer implementation
├── tokenizer_server.py        # MLM prediction server
├── server_requirements.txt    # Python server dependencies
├── requirements.txt           # Additional Python dependencies
├── pyproject.toml             # Python project configuration
├── test_*.py                  # Test files for tokenization
├── test.html                  # Test page for development
└── README.md                  # This file
```

## Browser Compatibility

- Chrome (Manifest V3)
- Chromium-based browsers (Edge, Brave, etc.)

## Privacy

- No data is collected or transmitted to external services
- All tokenization happens locally in your browser
- MLM predictions use a local server (localhost only)
- No external API calls (except for loading the tokenizer library)
- All text processing remains on your device

## Troubleshooting

- **Extension not working**: Make sure Developer mode is enabled
- **Colors not appearing**: Try refreshing the page and toggling the extension
- **MLM predictions not working**: Ensure the server is running on localhost:5001
- **Slow performance**: The extension processes text in batches to maintain responsiveness
- **Server connection issues**: Check that `python tokenizer_server.py` is running

## Development

To modify or extend the extension:

1. Edit the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh button on the extension card
4. Test your changes

## License

This project is open source and available under the MIT License.
