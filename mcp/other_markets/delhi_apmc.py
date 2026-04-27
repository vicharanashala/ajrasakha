import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import json

async def run():
    # Define the parameters to start the server
    server_params = StdioServerParameters(
        command="./env/bin/python",
        args=["server.py"],
        env=None
    )

    print("Starting client and connecting to server...")
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize the connection with the server
            await session.initialize()
            print("Connected to server successfully!\n")

            # 1. List available tools
            print("--- Available Tools ---")
            tools = await session.list_tools()
            for tool in tools.tools:
                print(f"- {tool.name}")
            print("-" * 23 + "\n")


            # 3. Call 'jarkhan_mandi_price' tool
            print("\nCalling jarkhan_mandi_price (limit 1)...")
            try:
                prices_result = await session.call_tool("jarkhan_mandi_price", {
                    "limit": 1
                })
                for content in prices_result.content:
                    print(f"Result snippet: {content.text}...")
            except Exception as e:
                print(f"Error calling jarkhan_mandi_price: {e}")

            # # 4. Call 'get_crop_variety' tool (with incorrect params to test error handling)
            # print("\nCalling get_crop_variety with invalid parameters to test our error handler...")
            # try:
            #     crop_err_result = await session.call_tool("get_crop_variety", {
            #         "crop": "C01",
            #         "year": "2024-25",
            #         "season": "KHARI"
            #     })
            #     for content in crop_err_result.content:
            #         print(f"Result: {content.text}")
            # except Exception as e:
            #     print(f"Error calling get_crop_variety: {e}")

            # 5. Call 'get_mandi_data_playwright' tool
            print("\nCalling Delhi mandi tool...")
            try:
                mandi_result = await session.call_tool("get_delhi_with_mandi", {
                    "mandi_name": "Azadpur"
                })
                for content in mandi_result.content:
                    # Let's just print a snippet so it doesn't flood the terminal
                    text_content = content.text
                    print(f"Result length: {len(text_content)}")
                    print(f"Result snippet: {text_content[:500]}...")
            except Exception as e:
                print(f"Error calling get_mandi_data_playwright: {e}")

            # 6. Call 'get_karnatka_state_daily' tool
            print("\nCalling Karnataka mandi tool...")
            try:
                karnatka_result = await session.call_tool("get_karnatka_state_daily", {})
                for content in karnatka_result.content:
                    # Let's just print a snippet so it doesn't flood the terminal
                    text_content = content.text
                    print(f"Result length: {len(text_content)}")
                    print(f"Result snippet: {text_content[:500]}...")
            except Exception as e:
                print(f"Error calling get_karnatka_state_daily: {e}")



if __name__ == "__main__":
    asyncio.run(run())