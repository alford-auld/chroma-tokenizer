#!/bin/bash
# Start the tokenizer server

echo "🚀 Starting tokenizer server..."
echo "Installing dependencies with uv..."

# Install dependencies
uv add flask flask-cors

echo "Starting server on http://localhost:5001"
echo "Press Ctrl+C to stop"

# Start the server
uv run python tokenizer_server.py
