#!/bin/bash

# Simple script to forward port 8084 via ngrok
# This gives public access to all three models through the unified nginx interface

# Configuration
NGROK_AUTH_TOKEN="356YAXiWaAU6uRn9EeYRjIPWZeg_5jYshjfSmu3dYwTH5LTu"  # Set your token here or via environment variable
NGROK_CONFIG_FILE="/home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface/.ngrok_auth"

echo "======================================================================"
echo "🌐 Starting Ngrok Tunnel for Port 8084"
echo "======================================================================"
echo ""
echo "This will forward the unified interface (port 8084) to the internet."
echo "All three models will be accessible through this single URL:"
echo ""
echo "  - Aksara:    <ngrok-url>/aksara/v1/chat/completions"
echo "  - AgriParam: <ngrok-url>/agriparam/v1/chat/completions"
echo "  - Dhenu2:    <ngrok-url>/dhenu2/v1/chat/completions"
echo "  - Web UI:    <ngrok-url>/"
echo ""
echo "======================================================================"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ Ngrok is not installed!"
    echo ""
    echo "To install ngrok:"
    echo "  wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz"
    echo "  tar xvzf ngrok-v3-stable-linux-amd64.tgz"
    echo "  sudo mv ngrok /usr/local/bin/"
    echo ""
    exit 1
fi

# Check if auth token is provided
if [ -z "$NGROK_AUTH_TOKEN" ]; then
    # Try to read from config file
    if [ -f "$NGROK_CONFIG_FILE" ]; then
        NGROK_AUTH_TOKEN=$(cat "$NGROK_CONFIG_FILE")
    fi
fi

# If still no token, ask user
if [ -z "$NGROK_AUTH_TOKEN" ]; then
    echo "⚠️  No ngrok auth token configured!"
    echo ""
    echo "To use your own ngrok account:"
    echo "1. Sign up at: https://dashboard.ngrok.com/signup"
    echo "2. Get your token from: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "3. Save it to file:"
    echo "   echo 'YOUR_TOKEN_HERE' > $NGROK_CONFIG_FILE"
    echo ""
    echo "Or set it as environment variable:"
    echo "   export NGROK_AUTH_TOKEN='YOUR_TOKEN_HERE'"
    echo "   ./start_ngrok.sh"
    echo ""
    read -p "Do you want to continue without authentication? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Using custom ngrok auth token"
    # Set the auth token for this session
    ngrok config add-authtoken "$NGROK_AUTH_TOKEN" 2>/dev/null
fi

# Check if nginx is running on port 8084
if ! lsof -i :8084 > /dev/null 2>&1; then
    echo "⚠️  WARNING: Nothing is running on port 8084!"
    echo ""
    echo "Please start nginx first:"
    echo "  cd /home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface"
    echo "  ./start_nginx.sh"
    echo ""
    read -p "Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Start ngrok
echo "Starting ngrok tunnel..."
echo ""
echo "📝 Ngrok web dashboard: http://localhost:4040"
echo ""

# Forward port 8084
ngrok http --domain=mesne-unlicentiously-allie.ngrok-free.dev 8084



