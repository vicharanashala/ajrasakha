#!/bin/bash
# Setup script for Weather MCP Server API keys

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MCP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$MCP_DIR/.env.weather"

echo "================================================"
echo "  Weather MCP Server - API Key Configuration"
echo "================================================"
echo ""

# Check if .env.weather exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: $ENV_FILE not found!"
    echo "Creating template file..."
    cat > "$ENV_FILE" << 'EOF'
# Weather API Keys for MCP Weather Server
# Get your keys from:
# - OpenWeatherMap: https://openweathermap.org/api
# - WeatherAPI: https://www.weatherapi.com/
# - Geoapify: https://www.geoapify.com/

# OpenWeatherMap API Key (Primary weather source)
OPENWEATHERMAP_API_KEY=

# WeatherAPI.com Key (Fallback source + air quality)
WEATHERAPI_KEY=

# Geoapify API Key (Reverse geocoding - pincode to location)
GEOAPIFY_API_KEY=
EOF
    echo "✅ Created template: $ENV_FILE"
fi

echo "Current API key status:"
echo ""

# Check each key
check_key() {
    local key_name="$1"
    local value=$(grep "^${key_name}=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
    
    if [ -z "$value" ]; then
        echo "❌ $key_name: NOT SET"
        return 1
    else
        echo "✅ $key_name: SET (${#value} characters)"
        return 0
    fi
}

all_set=true

if ! check_key "OPENWEATHERMAP_API_KEY"; then
    all_set=false
    echo "   Get free key: https://openweathermap.org/api"
fi

if ! check_key "WEATHERAPI_KEY"; then
    all_set=false
    echo "   Get free key: https://www.weatherapi.com/"
fi

if ! check_key "GEOAPIFY_API_KEY"; then
    all_set=false
    echo "   Get free key: https://www.geoapify.com/"
fi

echo ""
echo "================================================"

if [ "$all_set" = true ]; then
    echo "✅ All API keys are configured!"
    echo ""
    echo "To apply changes to the weather service:"
    echo "  sudo systemctl restart mcp-weather.service"
    exit 0
else
    echo "⚠️  Some API keys are missing!"
    echo ""
    echo "To configure API keys:"
    echo "  1. Edit: $ENV_FILE"
    echo "  2. Add your API keys from the URLs above"
    echo "  3. Restart service: sudo systemctl restart mcp-weather.service"
    echo ""
    echo "Note: The weather service will work with at least ONE API key set."
    echo "      - OPENWEATHERMAP_API_KEY or WEATHERAPI_KEY for weather data"
    echo "      - GEOAPIFY_API_KEY for location lookup from pincode"
    exit 1
fi
