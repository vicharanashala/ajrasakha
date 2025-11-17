#!/bin/bash
# Complete fix for Weather MCP Server API key issues

echo "================================================"
echo "  Fixing Weather MCP Server API Keys"
echo "================================================"
echo ""

# Step 1: Get API keys from user
echo "You need to get FREE API keys from these services:"
echo ""
echo "1. OpenWeatherMap (1000 calls/day free):"
echo "   https://openweathermap.org/api"
echo ""
echo "2. WeatherAPI.com (1M calls/month free):"
echo "   https://www.weatherapi.com/"
echo ""
echo "3. Geoapify (3000 requests/day free):"
echo "   https://www.geoapify.com/"
echo ""
echo "Press Enter after you have obtained the API keys..."
read

# Step 2: Open editor
echo "Opening .env.weather file in nano editor..."
echo "Please paste your API keys and save (Ctrl+O, Enter, Ctrl+X)"
echo ""
sleep 2

nano /home/ubuntu/Kshitij/sysd/ajrasakha/mcp/.env.weather

# Step 3: Verify keys
echo ""
echo "Verifying API keys..."
./setup-weather-keys.sh

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ API keys configured successfully!"
    echo ""
    echo "Now updating the systemd service..."
    
    # Step 4: Update service
    sudo cp /home/ubuntu/Kshitij/sysd/ajrasakha/mcp/systemd/mcp-weather.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl restart mcp-weather.service
    
    echo ""
    echo "Checking service status..."
    sudo systemctl status mcp-weather.service --no-pager -n 0
    
    echo ""
    echo "================================================"
    echo "✅ Weather MCP Server Updated!"
    echo "================================================"
    echo ""
    echo "The weather service should now work in LibreChat."
    echo "Test with: 'What is the weather in Pune?'"
    echo ""
else
    echo ""
    echo "❌ API keys not fully configured."
    echo "Please run this script again after getting API keys."
fi
