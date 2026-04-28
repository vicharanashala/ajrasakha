import os

CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
REMOTE_IP = os.getenv("REMOTE_IP", "100.100.108.44")

MCP_URLS = {
    "gdb":        f"http://{REMOTE_IP}:9005/mcp",
    "weather":    f"http://{REMOTE_IP}:9003/mcp",
    "soil":       f"http://{REMOTE_IP}:9008/mcp",
    "enam":       f"http://{REMOTE_IP}:9002/mcp",
    "agmarknet":  f"http://{REMOTE_IP}:9006/mcp",
    "reviewer":   f"http://{REMOTE_IP}:9007/mcp",
    "location":   f"http://{REMOTE_IP}:9000/mcp",
    "schemes":    f"http://{REMOTE_IP}:9009/mcp",
    "faq_video":  f"http://{REMOTE_IP}:9007/mcp",
    "chemical_checker": f"http://{REMOTE_IP}:9101/mcp",
}
