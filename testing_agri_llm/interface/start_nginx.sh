#!/bin/bash

# Script to start nginx with the unified configuration

NGINX_BIN="$HOME/.local/nginx/sbin/nginx"
NGINX_CONFIG="/home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface/nginx.conf"
NGINX_PID="/home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface/nginx.pid"

echo "======================================================================"
echo "🚀 Starting Nginx Reverse Proxy"
echo "======================================================================"

# Check if nginx is already running
if [ -f "$NGINX_PID" ]; then
    PID=$(cat "$NGINX_PID")
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Nginx is already running (PID: $PID)"
        echo "To restart, first run: ./stop_nginx.sh"
        exit 1
    fi
fi

# Start nginx
$NGINX_BIN -c "$NGINX_CONFIG" -g "pid $NGINX_PID;"

if [ $? -eq 0 ]; then
    echo "✅ Nginx started successfully on port 8084"
    echo ""
    echo "Unified API endpoint: http://localhost:8084"
    echo ""
    echo "Model endpoints:"
    echo "  - Aksara:    http://localhost:8084/aksara/v1/chat/completions"
    echo "  - AgriParam: http://localhost:8084/agriparam/v1/chat/completions"
    echo "  - Dhenu2:    http://localhost:8084/dhenu2/v1/chat/completions"
    echo ""
    echo "Web Interface: http://localhost:8084"
    echo ""
    echo "To stop nginx: ./stop_nginx.sh"
else
    echo "❌ Failed to start nginx"
    exit 1
fi

echo "======================================================================"

