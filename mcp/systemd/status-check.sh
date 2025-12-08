#!/bin/bash
# Quick Status Check for MCP Servers

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "         MCP SERVERS QUICK STATUS CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⏱️  Note: After starting, servers need 15-20 seconds to load embedding models"
echo ""

SERVICES=("mcp-server:9000" "mcp-gd:9001" "mcp-pop:9002" "mcp-market:9003" "mcp-weather:9004" "mcp-faq:9005")

printf "%-15s %-8s %-8s %-12s\n" "SERVICE" "PORT" "STATUS" "CONNECTIVITY"
echo "───────────────────────────────────────────────────────────────"

for service_port in "${SERVICES[@]}"; do
    IFS=':' read -r service port <<< "$service_port"
    
    # Check systemd status
    if systemctl is-active --quiet "$service"; then
        status="✅ Active"
    else
        status="❌ Inactive"
    fi
    
    # Check port connectivity
    if nc -z localhost "$port" 2>/dev/null; then
        connectivity="✅ Listening"
    else
        connectivity="❌ Down"
    fi
    
    printf "%-15s %-8s %-8s %-12s\n" "$service" "$port" "$status" "$connectivity"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Quick Commands:"
echo "  Start all:    sudo systemctl start mcp-server mcp-gd mcp-pop mcp-market mcp-weather mcp-faq"
echo "  Stop all:     sudo systemctl stop mcp-server mcp-gd mcp-pop mcp-market mcp-weather mcp-faq"
echo "  Restart all:  sudo systemctl restart mcp-server mcp-gd mcp-pop mcp-market mcp-weather mcp-faq"
echo "  View logs:    sudo journalctl -u mcp-server -f"
echo ""
echo "Or use the management script:"
echo "  cd /home/ubuntu/Kshitij/sysd/ajrasakha/mcp/systemd"
echo "  sudo ./manage.sh [start|stop|restart|status|logs] [service-name]"
echo ""
