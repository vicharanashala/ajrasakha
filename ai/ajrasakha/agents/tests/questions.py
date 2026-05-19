TEST_CASES = [
    {
        "name": "weather_question_1",
        "query": "What is the weather today in Ropar district of Punjab state?",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_tools": ["weather"]
    },

    {
        "name": "weather_question_2",
        "query": "Will it rain in Delhi today?",
        "location": {"city": "Delhi", "state": "Delhi"},
        "expected_tools": ["weather"]
    },

    {
        "name": "market_question_1",
        "query": "What is the price of wheat in Sirsa mandi, Haryana?",
        "location": {"city": "Sirsa", "state": "Haryana"},
        "expected_tools": ["market"]
    },

    {
        "name": "soil_question_1",
        "query": "My soil test shows Nitrogen 120, Phosphorus 40, Potassium 30, and OC 0.5%. What is the fertilizer dosage for Rice in Ropar, Punjab?",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_tools": ["soil"]
    },

    {
        "name": "scheme_question_1",
        "query": "How can I get subsidy for drip irrigation?",
        "location": {"city": "Jaipur", "state": "Rajasthan"},
        "expected_tools": ["schemes"]
    },

    {
        "name": "greeting_question",
        "query": "Namaste Ajrasakha!",
        "location": None,
        "expected_tools": []
    },

    {
        "name": "multi_tool_question",
        "query": "What is the weather today in Punjab? Also my wheat crop has yellow rust disease.",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_tools": ["weather", "upload_question"]
    }
]