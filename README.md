# Text Token Colorizer Chrome Extension

A Chrome extension that extracts text from web pages, calculates tokens using a local BPE tokenizer, and colorizes the text based on token ID using a log scale color map.

## Features

- **Text Extraction**: Automatically extracts all readable text from web pages
- **Token Calculation**: Uses a local BPE tokenizer to count tokens in text segments
- **Color Visualization**: Colorizes text based on token ID using a smooth log scale
  - Blue: Low token ID (common tokens)
  - Red: High token ID (rare tokens)
- **Individual Token Display**: Shows each token separately with color-coded complexity
- **Real-time Toggle**: Enable/disable colorization with a simple toggle
- **Non-intrusive**: Preserves original page functionality and styling

## Installation

1. **Download the extension files** to a local directory
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer mode** (toggle in the top right)
4. **Click "Load unpacked"** and select the directory containing the extension files
5. **Pin the extension** to your toolbar for easy access

## Usage

1. **Navigate to any webpage** you want to analyze
2. **Click the extension icon** in your toolbar
3. **Toggle the switch** to enable text colorization
4. **Watch as text gets colorized** based on token ID:
   - Blue tokens = low token ID (common tokens)
   - Red tokens = high token ID (rare tokens)
   - Superscript numbers show logarithmic token ID (e.g., 4.16, 3.00, 0.00)
5. **Toggle off** to restore original text colors

## How It Works

1. **Text Processing**: The extension walks through all text nodes on the page
2. **Tokenization**: Each text segment is tokenized using the GPT-OSS-20B tokenizer
3. **Individual Processing**: Each token is processed and colorized separately
4. **Color Mapping**: Token ID is mapped to colors using a logarithmic scale
5. **Visualization**: Each token gets its own color and logarithmic token ID

## Technical Details

- **Tokenizer**: Uses GPT-OSS-20B tokenizer via the Transformers.js library
- **Color Scale**: Logarithmic scale from blue (low token ID) to red (high token ID)
- **Performance**: Processes text in batches to avoid blocking the UI
- **Fallback**: Includes word-based tokenization as a fallback method

## Files Structure

```
chroma/
├── manifest.json          # Extension manifest
├── content.js            # Main content script
├── content.css           # Styling for colorized text
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
└── README.md             # This file
```

## Browser Compatibility

- Chrome (Manifest V3)
- Chromium-based browsers (Edge, Brave, etc.)

## Privacy

- No data is collected or transmitted
- All processing happens locally in your browser
- No external API calls (except for loading the tokenizer library)

## Troubleshooting

- **Extension not working**: Make sure Developer mode is enabled
- **Colors not appearing**: Try refreshing the page and toggling the extension
- **Slow performance**: The extension processes text in batches to maintain responsiveness

## Development

To modify or extend the extension:

1. Edit the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh button on the extension card
4. Test your changes

## License

This project is open source and available under the MIT License.
