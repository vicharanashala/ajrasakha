#!/bin/bash

# Script to stop nginx

NGINX_BIN="$HOME/.local/nginx/sbin/nginx"
NGINX_CONFIG="/home/aic_u2/Shubhankar/Pop/github_agri_llm/ajrasakha/testing_agri_llm/interface/nginx.conf"

echo "🛑 Stopping Nginx..."
$NGINX_BIN -s stop -c "$NGINX_CONFIG" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Nginx stopped successfully"
else
    echo "⚠️  Nginx may not be running or already stopped"
fi

