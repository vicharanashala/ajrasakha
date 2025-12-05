#!/bin/bash

# MCP Servers Management Script
# Convenient script to manage all MCP services

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service names
SERVICES=("mcp-server" "mcp-gd" "mcp-pop" "mcp-market" "mcp-weather" "mcp-faq")

print_usage() {
    echo "Usage: $0 {start|stop|restart|status|logs|enable|disable} [service-name]"
    echo ""
    echo "Commands:"
    echo "  start         Start all services or a specific service"
    echo "  stop          Stop all services or a specific service"
    echo "  restart       Restart all services or a specific service"
    echo "  status        Show status of all services or a specific service"
    echo "  logs          Show logs of all services or a specific service"
    echo "  enable        Enable all services or a specific service"
    echo "  disable       Disable all services or a specific service"
    echo ""
    echo "Services: ${SERVICES[*]}"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start all services"
    echo "  $0 start mcp-server         # Start only mcp-server"
    echo "  $0 status                   # Show status of all services"
    echo "  $0 logs mcp-weather         # Show logs for mcp-weather"
}

check_sudo() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${RED}This command requires sudo privileges${NC}"
        exit 1
    fi
}

validate_service() {
    local service=$1
    for s in "${SERVICES[@]}"; do
        if [[ "$s" == "$service" ]]; then
            return 0
        fi
    done
    echo -e "${RED}Invalid service: $service${NC}"
    echo "Available services: ${SERVICES[*]}"
    exit 1
}

execute_command() {
    local action=$1
    local service=$2
    
    if [[ -n "$service" ]]; then
        # Execute for specific service
        validate_service "$service"
        systemctl "$action" "$service"
    else
        # Execute for all services
        for s in "${SERVICES[@]}"; do
            echo -e "${BLUE}${action^} $s...${NC}"
            systemctl "$action" "$s"
        done
    fi
}

show_status() {
    local service=$1
    
    if [[ -n "$service" ]]; then
        validate_service "$service"
        systemctl status "$service"
    else
        for s in "${SERVICES[@]}"; do
            echo -e "${BLUE}======================================${NC}"
            echo -e "${BLUE}Status: $s${NC}"
            echo -e "${BLUE}======================================${NC}"
            systemctl status "$s" --no-pager || true
            echo ""
        done
    fi
}

show_logs() {
    local service=$1
    
    if [[ -n "$service" ]]; then
        validate_service "$service"
        journalctl -u "$service" -f
    else
        journalctl -u 'mcp-*' -f
    fi
}

# Main script logic
if [[ $# -lt 1 ]]; then
    print_usage
    exit 1
fi

COMMAND=$1
SERVICE=${2:-}

case $COMMAND in
    start)
        check_sudo
        execute_command start "$SERVICE"
        echo -e "${GREEN}✓ Done${NC}"
        if [[ -z "$SERVICE" ]]; then
            echo -e "${YELLOW}⏱️  Waiting 15 seconds for embedding models to load...${NC}"
            sleep 15
            echo -e "${GREEN}✓ Services should be ready now${NC}"
        fi
        ;;
    stop)
        check_sudo
        execute_command stop "$SERVICE"
        echo -e "${GREEN}✓ Done${NC}"
        ;;
    restart)
        check_sudo
        execute_command restart "$SERVICE"
        echo -e "${GREEN}✓ Done${NC}"
        ;;
    status)
        show_status "$SERVICE"
        ;;
    logs)
        show_logs "$SERVICE"
        ;;
    enable)
        check_sudo
        execute_command enable "$SERVICE"
        echo -e "${GREEN}✓ Done${NC}"
        ;;
    disable)
        check_sudo
        execute_command disable "$SERVICE"
        echo -e "${GREEN}✓ Done${NC}"
        ;;
    *)
        echo -e "${RED}Invalid command: $COMMAND${NC}"
        echo ""
        print_usage
        exit 1
        ;;
esac
