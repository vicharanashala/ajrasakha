import asyncio
import sys
import subprocess
import time

async def run_demo():
    print("Starting MCP Server on port 9020...")
    server_process = subprocess.Popen(
        [sys.executable, "mcp_server.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    time.sleep(5)
    
    try:
        url = "http://127.0.0.1:9020/mcp"
        print(f"Connecting to MCP Server at {url} using LangChain MCP adapters...")
        
        # Use the proven adapter from the main codebase
        from langchain_mcp_adapters.client import MultiServerMCPClient
        client = MultiServerMCPClient({
            "crop_recommendation": {
                "url": url,
                "transport": "http"
            }
        })
        
        tools = await client.get_tools()
        recommend_tool = next(t for t in tools if "recommend_crop" in t.name)
        
        print("\nConnected! Querying 'recommend_crop' tool with sample inputs:")
        print("   N=90, P=42, K=43, Temp=20.8°C, Humidity=82%, pH=6.5, Rain=202.9mm\n")
        
        result = await recommend_tool.ainvoke({
            "nitrogen": 90.0,
            "phosphorus": 42.0,
            "potassium": 43.0,
            "temperature": 20.8,
            "humidity": 82.0,
            "ph": 6.5,
            "rainfall": 202.9
        })
        
        print("--- RESULT ---")
        print(result)
        print("------------------\n")
        
    except Exception as e:
        print(f"Error during MCP query: {e}")
    finally:
        print("Shutting down MCP Server...")
        server_process.terminate()
        server_process.wait(timeout=5)
        print("Done.")

if __name__ == "__main__":
    asyncio.run(run_demo())
