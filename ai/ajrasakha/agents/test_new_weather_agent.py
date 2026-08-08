# ajrasakha/agents/test_new_weather_agent.py
# LangGraph / LangChain Test Runner for new_weather agent

import asyncio
import json
import os
import sys

# Ensure ajrasakha package directory is in sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
_ai_root = os.path.abspath(os.path.join(_current_dir, "..", "..", ".."))
if _ai_root not in sys.path:
    sys.path.insert(0, _ai_root)

from ajrasakha.agents.new_weather_agent import new_weather


async def run_langgraph_agent_tests():
    print("=" * 85)
    print(" 🤖 TESTING NEW WEATHER AGENT FOR LANGGRAPH INTEGRATION")
    print("=" * 85 + "\n")

    test_queries = [
        {
            "title": "1. General 5-Day Forecast Query (Tool 1)",
            "input": {
                "query": "What is the 5 days weather forecast for Ernakulam?",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "2. Rainfall & Monsoon Progress Query (Tool 2)",
            "input": {
                "query": "How much rain fell in Ernakulam in the past 24 hours and monsoon status?",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "3. Temperature & Humidity Observation Query (Tool 3)",
            "input": {
                "query": "What is the temperature and humidity right now in Ernakulam?",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "4. Hyper-Local Location & Nearby 50km Stations Query (Tool 4)",
            "input": {
                "query": "Show weather for Piravom block in Ernakulam with 5 nearest weather stations within 50km.",
                "district": "Ernakulam",
                "state": "Kerala",
                "location": "Piravom"
            }
        },
        {
            "title": "5. Short-Term 0-3 Hour Nowcast Prediction Query (Tool 5)",
            "input": {
                "query": "Will it rain in the next 2 hours in Kottayam?",
                "district": "Kottayam",
                "state": "Kerala"
            }
        },
        {
            "title": "5b. Pala Nowcast Query (Tool 5)",
            "input": {
                "query": "rainfall condition for the next 2 hrs in pala, kerala",
                "district": "Pala",
                "state": "Kerala"
            }
        },
        {
            "title": "6. Severe Weather Warning & Red/Orange Alert Query (Tool 6)",
            "input": {
                "query": "Are there any heavy rain warnings or Red/Orange alerts for Ernakulam?",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "6b. Moovattupuzha Weather Alert Query (Tool 6)",
            "input": {
                "query": "weather alert in moovatupuzha",
                "district": "Moovattupuzha",
                "state": "Kerala"
            }
        },
        {
            "title": "7. Target Date Query (Tool 1 - Specific Date)",
            "input": {
                "query": "weather condition on August 15 in Ernakulam",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "8. Extended Date Query 2 Weeks Out (Tool 3 - Temperature)",
            "input": {
                "query": "temperature after 2 weeks in Ernakulam",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "9. Historical Past Date Range Query (Tool 2 - Rainfall)",
            "input": {
                "query": "rainfall in past 3 days in Ernakulam",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "10. Next 3 Days Rainfall Status (Tool 2 - Aluva)",
            "input": {
                "query": "rainfall status in next 3 dyas in aluva, kerala",
                "district": "Aluva",
                "state": "Kerala"
            }
        },
        {
            "title": "11. State-Wide Alert Query for Kerala (Tool 6 - Kerala)",
            "input": {
                "query": "any alert in kerala today",
                "district": "Kerala",
                "state": "Kerala"
            }
        },
        {
            "title": "12. Athani, Nedumbassery Nowcast Query (Tool 5)",
            "input": {
                "query": "next 2 hrs weather condition in athani, nedumbassery",
                "location": "Athani, Nedumbassery",
                "state": "Kerala"
            }
        },
        {
            "title": "13. Thrikkakara Nowcast Query (Tool 5)",
            "input": {
                "query": "next 2hrs climate in thrikkakara, kerala",
                "location": "Thrikkakara",
                "state": "Kerala"
            }
        },
        {
            "title": "14. Kalamassery Today Climate Query (Tool 1 - Today)",
            "input": {
                "query": "todays climate in kalamassery, kerala",
                "location": "Kalamassery",
                "state": "Kerala"
            }
        },
        {
            "title": "15. Next 2 Days Rainfall Query (Tool 2 - Next 2 Days)",
            "input": {
                "query": "rainfall status for next 2 days in aluva, kerala",
                "location": "Aluva",
                "state": "Kerala"
            }
        },
        {
            "title": "16. Past 2 Days Rainfall Query (Tool 2 - Past 2 Days)",
            "input": {
                "query": "rainfall in past 2 days in Ernakulam",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "17. User Exact Past Two Days Climate Query (Edappally)",
            "input": {
                "query": "climate in edappally, kochi, kerala for the past two days",
                "location": "Edappally, Kochi",
                "state": "Kerala"
            }
        },
        {
            "title": "18. User Exact Unavailable Past Date Query (August 1)",
            "input": {
                "query": "climate in edappally, kochi, kerala for the august 1",
                "location": "Edappally, Kochi",
                "state": "Kerala"
            }
        },
        {
            "title": "19. Date List Query (7,8, 9 august)",
            "input": {
                "query": "climate for the days 7,8, 9 august in kakkanad, ernakulam",
                "location": "Kakkanad",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "20. Date Range Query (7 August to 9 august)",
            "input": {
                "query": "climate for the days 7 August to 9 august in kakkanad, ernakulam",
                "location": "Kakkanad",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "21. Date Slash Range Query (7/August to 9/august)",
            "input": {
                "query": "climate for the days 7/August to 9/august in kakkanad, ernakulam",
                "location": "Kakkanad",
                "district": "Ernakulam",
                "state": "Kerala"
            }
        },
        {
            "title": "22. Kottiyur (Single 'u') Today Climate Query",
            "input": {
                "query": "climate in kottiyur, kerala today",
                "location": "Kottiyur",
                "state": "Kerala"
            }
        },
        {
            "title": "23. Kottiyoor (Double 'oo') Today Climate Query",
            "input": {
                "query": "climate in kottiyoor, kerala today",
                "location": "Kottiyoor",
                "state": "Kerala"
            }
        },
        {
            "title": "24. Past 2 Days Query (Pulickal Kavala)",
            "input": {
                "query": "climate for the past 2 days in pulickal kavala, kottayam, kerala",
                "location": "Pulickal Kavala",
                "district": "Kottayam",
                "state": "Kerala"
            }
        },
        {
            "title": "25. Yesterday Query (Pulickal Kavala)",
            "input": {
                "query": "climate on yesterday in pulickal kavala, kottayam, kerala",
                "location": "Pulickal Kavala",
                "district": "Kottayam",
                "state": "Kerala"
            }
        },
        {
            "title": "26. August 1 Query (Pulickal Kavala)",
            "input": {
                "query": "climate on august 1 in pulickal kavala, kottayam, kerala",
                "location": "Pulickal Kavala",
                "district": "Kottayam",
                "state": "Kerala"
            }
        }
    ]

    for item in test_queries:
        print("-" * 85)
        print(f"📌 {item['title']}")
        print(f"   Query: {item['input']['query']}")
        print("-" * 85)
        
        # Invoke tool using LangChain ainvoke syntax used in LangGraph nodes
        res_str = await new_weather.ainvoke(item["input"])
        try:
            from ajrasakha.agents.tool_output_formatters import format_tool_output
            formatted_text = format_tool_output("weather", res_str)
            print(formatted_text + "\n")
        except Exception as exc:
            print(f"Error formatting: {exc}\n" + res_str[:300] + "...\n")

    print("=" * 85)
    print(" ✅ NEW WEATHER AGENT READY FOR LANGGRAPH INTEGRATION!")
    print("=" * 85)


if __name__ == "__main__":
    asyncio.run(run_langgraph_agent_tests())
