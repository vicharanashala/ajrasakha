import os

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5-20250929")

MCP_URLS = {
    "gdb": os.getenv("MCP_GDB_URL", "http://host.docker.internal:8005/mcp"),
    "weather": os.getenv("MCP_WEATHER_URL", "http://host.docker.internal:8003/mcp"),
    "enam": os.getenv("MCP_ENAM_URL", "http://host.docker.internal:8002/mcp"),
    "agmarknet": os.getenv("MCP_AGMARKNET_URL", "http://host.docker.internal:8001/mcp"),
    "location": os.getenv("MCP_LOCATION_URL", "http://host.docker.internal:8004/mcp"),

    "soil": os.getenv("MCP_SOIL_URL", "http://100.100.108.44:9008/mcp"),
    "reviewer": os.getenv("MCP_REVIEWER_URL", "http://100.100.108.44:9007/mcp"),
    "schemes": os.getenv("MCP_SCHEMES_URL", "http://100.100.108.44:9009/mcp"),
    "faq_video": os.getenv("MCP_FAQ_VIDEO_URL", "http://100.100.108.44:9007/mcp"),
    "chemical_checker": os.getenv("MCP_CHEMICAL_CHECKER_URL", "http://100.100.108.44:9101/mcp"),
}