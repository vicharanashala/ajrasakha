TOOL_TO_MCP_SERVICE = {
    # Reviewer
    "upload_question_to_reviewer_system": "reviewer",

    # Location
    "location_information_tool": "location",

    # Weather
    "weather": "weather",
    "weather_information_tool": "weather",
    "get_weather_forecast": "weather",
    "get_current_weather": "weather",
    "get_district_warnings": "weather",
    "get_district_rainfall": "weather",
    "get_realtime_weather_by_state": "weather",
    "get_subdivision_warnings": "weather",
    "get_subdivision_rainfall_forecast": "weather",

    # Market
    "market": "market",
    "get_states": "market",
    "get_districts": "market",
    "get_markets": "market",
    "get_commodities": "market",
    "get_price_arrivals": "market",
    "get_today_date_for_enam": "market",
    "get_state_list_from_enam": "market",
    "get_apmc_list_from_enam": "market",
    "get_commodity_list_from_enam": "market",
    "get_trade_data_from_enam": "market",

    # Soil
    "soil": "soil",
    "get_fertilizer_dosage": "soil",

    # Schemes
    "schemes": "schemes",
    "govt_schemes": "schemes",
    "get_scheme_details": "schemes",

    # Golden DB / RAG
    "gdb": "golden_db",
    "golden_retriever_tool": "golden_db",
    "golden_exact_search_tool": "golden_db",
    "get_available_states": "golden_db",
    "get_available_crops": "golden_db",
    "get_available_domains": "golden_db",
    "get_available_seasons": "golden_db",
}




def normalize_tool_name(tool_name: str) -> str:
    return tool_name.strip()


def infer_mcp_services(tool_names: list[str]) -> list[str]:
    services = set()

    for tool in tool_names:
        normalized = normalize_tool_name(tool)

        service = TOOL_TO_MCP_SERVICE.get(normalized)

        if service:
            services.add(service)

    return sorted(services)
