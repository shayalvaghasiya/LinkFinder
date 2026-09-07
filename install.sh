#!/bin/bash

# LinkFinder - Installation and Test Script

set -e

echo "🎯 LinkFinder Installation Script"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Python version
echo "Checking Python version..."
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
REQUIRED_VERSION="3.9"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo -e "${RED}❌ Python 3.9+ required. Found: $PYTHON_VERSION${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python $PYTHON_VERSION${NC}"

# Check if Ollama is installed
echo ""
echo "Checking Ollama..."
if ! command -v ollama &> /dev/null; then
    echo -e "${YELLOW}⚠ Ollama not found${NC}"
    echo "Please install from: https://ollama.ai"
    echo "Then run: ollama pull phi3"
    exit 1
fi
echo -e "${GREEN}✓ Ollama installed${NC}"

# Check if phi3 model is available
echo "Checking phi3 model..."
if ! ollama list | grep -q "phi3"; then
    echo -e "${YELLOW}⚠ phi3 model not found${NC}"
    echo "Pulling phi3 model..."
    ollama pull phi3
fi
echo -e "${GREEN}✓ phi3 model ready${NC}"

# Setup backend
echo ""
echo "Setting up backend..."
cd backend

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

echo -e "${GREEN}✓ Backend setup complete${NC}"

# Run tests
echo ""
echo "Running tests..."
cd ../tests
pip install -q -r requirements-test.txt
if pytest test_normalization.py -q; then
    echo -e "${GREEN}✓ Tests passed${NC}"
else
    echo -e "${RED}❌ Tests failed${NC}"
    exit 1
fi

cd ../backend

# Start server in background for health check
echo ""
echo "Starting backend server..."
python main.py > /dev/null 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Health check
echo "Running health check..."
if curl -s http://localhost:8000/api/v1/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ Backend server healthy${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
    kill $SERVER_PID
    exit 1
fi

# Keep server running
echo ""
echo -e "${GREEN}=================================="
echo "✓ Installation Complete!"
echo "==================================${NC}"
echo ""
echo "Backend is running at: http://localhost:8000"
echo "API docs: http://localhost:8000/docs"
echo ""
echo "Next steps:"
echo "1. Open Chrome → chrome://extensions/"
echo "2. Enable 'Developer mode'"
echo "3. Click 'Load unpacked'"
echo "4. Select the 'extension/' folder"
echo "5. Click the extension icon and configure your profile"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Wait for user interrupt
wait $SERVER_PID
