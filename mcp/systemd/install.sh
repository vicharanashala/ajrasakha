#!/bin/bash

# MCP Servers Installation Script
# This script installs and enables all MCP systemd services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service names
SERVICES=("mcp-server" "mcp-gd" "mcp-pop" "mcp-market" "mcp-weather" "mcp-faq")

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}MCP Servers Systemd Installation${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root (use sudo)${NC}"
   exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${YELLOW}Step 1: Copying service files to /etc/systemd/system/${NC}"
for service in "${SERVICES[@]}"; do
    if [ -f "$SCRIPT_DIR/$service.service" ]; then
        cp "$SCRIPT_DIR/$service.service" /etc/systemd/system/
        echo -e "${GREEN}✓${NC} Copied $service.service"
    else
        echo -e "${RED}✗${NC} File not found: $service.service"
        exit 1
    fi
done

echo ""
echo -e "${YELLOW}Step 2: Reloading systemd daemon${NC}"
systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"

echo ""
echo -e "${YELLOW}Step 3: Enabling services${NC}"
for service in "${SERVICES[@]}"; do
    systemctl enable "$service"
    echo -e "${GREEN}✓${NC} Enabled $service"
done

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "Services installed and enabled:"
for service in "${SERVICES[@]}"; do
    echo "  - $service"
done

echo ""
echo -e "${YELLOW}To start all services now, run:${NC}"
echo "  sudo systemctl start mcp-server mcp-gd mcp-pop mcp-market mcp-weather mcp-faq"
echo ""
echo -e "${YELLOW}To check status:${NC}"
echo "  sudo systemctl status mcp-server"
echo ""
echo -e "${YELLOW}To view logs:${NC}"
echo "  sudo journalctl -u mcp-server -f"
echo ""
