#!/bin/bash

# MCP Servers Uninstallation Script
# This script stops, disables, and removes all MCP systemd services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service names
SERVICES=("mcp-server" "mcp-gd" "mcp-pop" "mcp-market" "mcp-weather" "mcp-faq")

echo -e "${RED}======================================${NC}"
echo -e "${RED}MCP Servers Systemd Uninstallation${NC}"
echo -e "${RED}======================================${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root (use sudo)${NC}"
   exit 1
fi

echo -e "${YELLOW}Step 1: Stopping services${NC}"
for service in "${SERVICES[@]}"; do
    if systemctl is-active --quiet "$service"; then
        systemctl stop "$service"
        echo -e "${GREEN}✓${NC} Stopped $service"
    else
        echo -e "${YELLOW}○${NC} $service was not running"
    fi
done

echo ""
echo -e "${YELLOW}Step 2: Disabling services${NC}"
for service in "${SERVICES[@]}"; do
    if systemctl is-enabled --quiet "$service" 2>/dev/null; then
        systemctl disable "$service"
        echo -e "${GREEN}✓${NC} Disabled $service"
    else
        echo -e "${YELLOW}○${NC} $service was not enabled"
    fi
done

echo ""
echo -e "${YELLOW}Step 3: Removing service files${NC}"
for service in "${SERVICES[@]}"; do
    if [ -f "/etc/systemd/system/$service.service" ]; then
        rm "/etc/systemd/system/$service.service"
        echo -e "${GREEN}✓${NC} Removed $service.service"
    else
        echo -e "${YELLOW}○${NC} $service.service not found in /etc/systemd/system/"
    fi
done

echo ""
echo -e "${YELLOW}Step 4: Reloading systemd daemon${NC}"
systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Uninstallation Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
