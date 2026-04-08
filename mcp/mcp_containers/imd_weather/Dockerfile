FROM python:3.10-slim

WORKDIR /app

# 1. Install dependencies
# Context is 'mcp/', so we look inside 'mcp_containers'
COPY mcp_containers/imd_weather/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. Copy the IMD API Wrapper 
# Context is 'mcp/'. The wrapper is right here in 'mcp/imd_weather_api_wrapper'
# DO NOT use ../ because it is already inside the build context.
COPY imd_weather_api_wrapper/ /app/imd_weather_api_wrapper/

# 3. Copy the MCP server code
COPY mcp_containers/imd_weather/imd_weather.py .

# 4. Configure Environment
ENV PYTHONPATH="/app:/app/imd_weather_api_wrapper"
ENV IMD_BASE_URL="http://100.100.108.101:18080"

EXPOSE 9006

CMD ["python", "imd_weather.py"]