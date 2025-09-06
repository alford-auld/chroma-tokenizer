#!/bin/bash

# Test script to run tokenization test
echo "🧪 Running Tokenization Test"
echo "=============================="

# Check if uv is available
if ! command -v uv &> /dev/null; then
    echo "❌ uv is not installed. Please install it first:"
    echo "   curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Check if test.html exists
if [ ! -f "test.html" ]; then
    echo "❌ test.html not found"
    exit 1
fi

# Install dependencies with uv
echo "📦 Installing Python dependencies with uv..."
uv sync

# Run the test
echo "🚀 Running tokenization test..."
uv run python test_tokenizer.py --model gpt2 --input test.html --output output.html

# Check if output was created
if [ -f "output.html" ]; then
    echo "✅ Test completed successfully!"
    echo "📄 Output file: output.html"
    echo "🌐 Open output.html in your browser to see the results"
else
    echo "❌ Test failed - output.html was not created"
    exit 1
fi
