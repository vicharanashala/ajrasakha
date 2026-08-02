#!/bin/bash
# Setup script for HuggingFace sync - MacBook M5 compatible

set -e

cd "$(dirname "$0")"

echo "=== HuggingFace Sync Setup ==="
echo ""

# Check if conda is available
if command -v conda &> /dev/null; then
    echo "Using conda..."
    conda create -n hf-sync python=3.12 -y
    source "$(conda info --base)/etc/profile.d/conda.sh"
    conda activate hf-sync
else
    echo "Using venv..."
    python3 -m venv venv
    source venv/bin/activate
fi

echo "Python: $(python --version)"
echo ""

echo "Installing dependencies..."
pip install --upgrade pip
pip install python-dotenv>=1.0.0
pip install pymongo>=4.10.0
pip install datasets>=2.14.0
pip install huggingface-hub>=0.20.0

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "To activate the environment:"
echo "  source venv/bin/activate"
echo ""
echo "To test the sync:"
echo "  python sync.py --dry-run --limit 10"