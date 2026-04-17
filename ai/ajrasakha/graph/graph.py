# # from langchain_anthropic import ChatAnthropic
# # from langgraph.graph import StateGraph, END
# # from typing import TypedDict, List, Optional
# #
# # from ajrasakha.tools.market import *
# # from ajrasakha.tools.location import *
# #
# #
# # from typing import TypedDict, List, Optional
# # from langgraph.graph import StateGraph, END
# # import json
# #
# # # ---- LLM ----
# # llm = ChatAnthropic(
# # model="claude-sonnet-4-5-20250929",
# # )
# #
# #
# #
# #
# # from pydantic import BaseModel
# #
# # class QuerySchema(BaseModel):
# #     state: str | None
# #     commodity: str
# #     latitude: float | None
# #     longitude: float | None
# #
# # # ---- STATE ----
# # class State(TypedDict):
# #     query: str
# #
# #     latitude: Optional[float]
# #     longitude: Optional[float]
# #
# #     state_name: Optional[str]
# #     state_id: Optional[str]
# #
# #     commodity: Optional[str]
# #
# #     apmc_list: List[str]
# #     current_apmc_index: int
# #
# #     result: Optional[dict]
# #     done: bool
# #
# # parse_query_structured_llm = llm.with_structured_output(QuerySchema)
# #
# # # ---- NODE 1: PARSE QUERY ----
# # async def parse_query(state: State):
# #     prompt = f"""
# #     Extract structured info from this query:
# #
# #     Query: {state["query"]}
# #
# #     Return STRICT JSON:
# #     {{
# #       "state": "... or null",
# #       "commodity": "...",
# #       "latitude": null or float,
# #       "longitude": null or float
# #     }}
# #     """
# #
# #     res = await parse_query_structured_llm.ainvoke(prompt)
# #
# #     state["state_name"] = res.state
# #     state["commodity"] = res.commodity
# #     state["latitude"] = res.latitude
# #     state["longitude"] = res.longitude
# #     state["done"] = False
# #
# #     return state
# #
# #
# # # ---- NODE 2: RESOLVE LAT/LON → STATE ----
# # async def resolve_location(state: State):
# #     if state.get("latitude") and state.get("longitude"):
# #         loc = await location_information_tool.ainvoke({
# #             "latitude": state["latitude"],
# #             "longitude": state["longitude"],
# #         })
# #         state["state_name"] = loc.get("state")
# #
# #     return state
# #
# #
# # # ---- NODE 3: GET STATE ID ----
# # async def get_state(state: State):
# #     res = await get_state_list_from_enam.ainvoke({})
# #
# #     data = res.get("data", {}).get("data", [])
# #
# #     for s in data:
# #         if state["state_name"] and state["state_name"].lower() in s["state_name"].lower():
# #             state["state_id"] = s["state_id"]
# #             state["state_name"] = s["state_name"]
# #             break
# #
# #     return state
# #
# # # ---- NODE 4: GET APMC LIST ----
# # async def get_apmcs(state: State):
# #     if "state_id" not in state or not state["state_id"]:
# #         state["done"] = True
# #         state["result"] = {"error": "state_id missing"}
# #         return state
# #
# #     res = await get_apmc_list_from_enam.ainvoke({
# #         "state_id": state["state_id"]
# #     })
# #
# #     data = res.get("data", {}).get("data", [])
# #
# #     if not isinstance(data, list):
# #         state["done"] = True
# #         state["result"] = {"error": "Invalid APMC response"}
# #         return state
# #
# #     state["apmc_list"] = [
# #         a.get("apmc_name")
# #         for a in data
# #         if isinstance(a, dict) and a.get("apmc_name")
# #     ]
# #
# #     state["current_apmc_index"] = 0
# #
# #     return state
# #
# #
# # from pydantic import BaseModel
# #
# # class CommodityMatch(BaseModel):
# #     matched: bool
# #     commodity: str | None
# #
# # commodity_llm = llm.with_structured_output(CommodityMatch)
# #
# # async def match_commodity(user_comm, comm_list):
# #     prompt = f"""
# #     User is searching for: {user_comm}
# #
# #     Available commodities:
# #     {comm_list}
# #
# #     Rules:
# #     - Match semantically (e.g. chilli → Red Chilli, Dry Chilli)
# #     - If no good match exists, return matched=false
# #     - Do NOT guess randomly
# #
# #     Return JSON:
# #     {{
# #       "matched": true/false,
# #       "commodity": "exact string from list or null"
# #     }}
# #     """
# #
# #     res = await commodity_llm.ainvoke(prompt)
# #     return res
# #
# # async def try_apmc(state: State):
# #     if state["current_apmc_index"] >= len(state["apmc_list"]):
# #         state["done"] = True
# #         return state
# #
# #     apmc = state["apmc_list"][state["current_apmc_index"]]
# #     date = get_today_date_for_enam.invoke({})
# #
# #     comm_res = await get_commodity_list_from_enam.ainvoke({
# #         "state_name": state["state_name"],
# #         "apmc_name": apmc,
# #         "from_date": date,
# #         "to_date": date,
# #     })
# #
# #     comm_data = comm_res.get("data", {}).get("data", [])
# #
# #     if not isinstance(comm_data, list) or not comm_data:
# #         state["current_apmc_index"] += 1
# #         return state
# #
# #     comm_list = [
# #         c.get("commodity")
# #         for c in comm_data
# #         if isinstance(c, dict) and c.get("commodity")
# #     ]
# #
# #     if not comm_list:
# #         state["current_apmc_index"] += 1
# #         return state
# #
# #     match = await match_commodity(state["commodity"], comm_list)
# #
# #     if not match.matched:
# #         state["current_apmc_index"] += 1
# #         return state
# #
# #     commodity = match.commodity
# #
# #     trade = await get_trade_data_from_enam.ainvoke({
# #         "state_name": state["state_name"],
# #         "apmc_name": apmc,
# #         "commodity_name": commodity,
# #         "from_date": date,
# #         "to_date": date,
# #     })
# #
# #     trade_data = trade.get("data", {}).get("data")
# #
# #     if trade_data:
# #         state["result"] = {
# #             "apmc": apmc,
# #             "commodity": commodity,
# #             "data": trade_data,
# #         }
# #         state["done"] = True
# #         return state
# #
# #     state["current_apmc_index"] += 1
# #     return state
# #
# #
# # # ---- CONDITIONAL ----
# # def should_continue(state: State):
# #     if state["done"]:
# #         return END
# #     return "try_apmc"
# #
# #
# # # ---- GRAPH ----
# # builder = StateGraph(State)
# #
# # builder.add_node("parse_query", parse_query)
# # builder.add_node("resolve_location", resolve_location)
# # builder.add_node("get_state", get_state)
# # builder.add_node("get_apmcs", get_apmcs)
# # builder.add_node("try_apmc", try_apmc)
# #
# # builder.set_entry_point("parse_query")
# #
# # builder.add_edge("parse_query", "resolve_location")
# # builder.add_edge("resolve_location", "get_state")
# # builder.add_edge("get_state", "get_apmcs")
# # builder.add_edge("get_apmcs", "try_apmc")
# #
# # builder.add_conditional_edges("try_apmc", should_continue)
# #
# # graph = builder.compile()
#
#
#
# from typing import TypedDict, List, Optional
# from langgraph.graph import StateGraph, END
# from langchain_anthropic import ChatAnthropic
# from pydantic import BaseModel
# from datetime import datetime
#
# from ajrasakha.tools.market import *
# from ajrasakha.tools.location import *
#
# # ---- LLM ----
# llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")
#
# # ---- SCHEMAS ----
# class QuerySchema(BaseModel):
#     state: Optional[str]
#     commodity: str
#     latitude: Optional[float]
#     longitude: Optional[float]
#
#
# class SelectionSchema(BaseModel):
#     apmc: str
#     commodity: str
#
#
# # ---- STATE ----
# class State(TypedDict):
#     query: str
#     latitude: Optional[float]
#     longitude: Optional[float]
#     state_name: Optional[str]
#     state_id: Optional[str]
#     commodity: Optional[str]
#     apmc_list: List[str]
#     selected_apmc: Optional[str]
#     result: Optional[dict]
#     done: bool
#
#
# # ---- STRUCTURED LLM ----
# parse_llm = llm.with_structured_output(QuerySchema)
# select_llm = llm.with_structured_output(SelectionSchema)
#
#
# # ---- NODE 1 ----
# async def parse_query(state: State):
#     res = await parse_llm.ainvoke(state["query"])
#
#     state["state_name"] = res.state
#     state["commodity"] = res.commodity
#     state["latitude"] = res.latitude
#     state["longitude"] = res.longitude
#     state["done"] = False
#
#     return state
#
#
# # ---- NODE 2 ----
# async def resolve_location(state: State):
#     if state.get("latitude") and state.get("longitude"):
#         loc = await location_information_tool.ainvoke({
#             "latitude": state["latitude"],
#             "longitude": state["longitude"],
#         })
#         state["state_name"] = loc.get("state")
#
#     return state
#
#
# # ---- NODE 3 ----
# async def get_state(state: State):
#     res = await get_state_list_from_enam.ainvoke({})
#     data = res.get("data", {}).get("data", [])
#
#     for s in data:
#         if state["state_name"] and state["state_name"].lower() in s["state_name"].lower():
#             state["state_id"] = s["state_id"]
#             state["state_name"] = s["state_name"]
#             break
#
#     return state
#
#
# # ---- NODE 4 ----
# async def get_apmcs(state: State):
#     if not state.get("state_id"):
#         state["done"] = True
#         state["result"] = {"error": "State not found"}
#         return state
#
#     res = await get_apmc_list_from_enam.ainvoke({
#         "state_id": state["state_id"]
#     })
#
#     data = res.get("data", {}).get("data", [])
#
#     state["apmc_list"] = [
#         a.get("apmc_name")
#         for a in data
#         if isinstance(a, dict) and a.get("apmc_name")
#     ]
#
#     return state
#
#
# # ---- NODE 5 (INTELLIGENCE) ----
# async def select_apmc_and_commodity(state: State):
#     if not state["apmc_list"]:
#         state["done"] = True
#         state["result"] = {"error": "No mandis found"}
#         return state
#
#     prompt = f"""
#     User query: {state["query"]}
#
#     Commodity: {state["commodity"]}
#
#     Available mandis:
#     {state["apmc_list"][:50]}
#
#     Task:
#     1. Pick the most relevant mandi
#     2. Normalize commodity name if needed
#
#     Return:
#     {{
#         "apmc": "...",
#         "commodity": "..."
#     }}
#     """
#
#     res = await select_llm.ainvoke(prompt)
#
#     state["selected_apmc"] = res.apmc
#     state["commodity"] = res.commodity
#
#     return state
#
# # ---- NODE 6 ----
# async def fetch_trade(state: State):
#     raw_date = get_today_date_for_enam.invoke({})
#     date = datetime.strptime(raw_date, "%d-%m-%Y").strftime("%Y-%m-%d")
#
#     apmc = state["selected_apmc"]
#
#     comm_res = await get_commodity_list_from_enam.ainvoke({
#         "state_name": state["state_name"],
#         "apmc_name": apmc,
#         "from_date": date,
#         "to_date": date,
#     })
#
#     comm_data = comm_res.get("data", {}).get("data", [])
#
#     if not isinstance(comm_data, list) or not comm_data:
#         state["done"] = True
#         state["result"] = {"error": f"No commodities in {apmc}"}
#         return state
#
#     comm_list = [
#         c.get("commodity")
#         for c in comm_data
#         if isinstance(c, dict) and c.get("commodity")
#     ]
#
#     match_prompt = f"""
#     User commodity: {state["commodity"]}
#     Available: {comm_list}
#     Return closest exact match.
#     """
#
#     match = await llm.ainvoke(match_prompt)
#     commodity = match.content.strip()
#
#     trade = await get_trade_data_from_enam.ainvoke({
#         "state_name": state["state_name"],
#         "apmc_name": apmc,
#         "commodity_name": commodity,
#         "from_date": date,
#         "to_date": date,
#     })
#
#     trade_data = trade.get("data", {}).get("data")
#
#     if not trade_data:
#         state["done"] = True
#         state["result"] = {
#             "error": f"No trade data for {commodity} in {apmc}"
#         }
#         return state
#
#     state["result"] = {
#         "apmc": apmc,
#         "commodity": commodity,
#         "data": trade_data,
#     }
#     state["done"] = True
#     return state
#
#
# # ---- GRAPH ----
# builder = StateGraph(State)
#
# builder.add_node("parse_query", parse_query)
# builder.add_node("resolve_location", resolve_location)
# builder.add_node("get_state", get_state)
# builder.add_node("get_apmcs", get_apmcs)
# builder.add_node("select_apmc_and_commodity", select_apmc_and_commodity)
# builder.add_node("fetch_trade", fetch_trade)
#
# builder.set_entry_point("parse_query")
#
# builder.add_edge("parse_query", "resolve_location")
# builder.add_edge("resolve_location", "get_state")
# builder.add_edge("get_state", "get_apmcs")
# builder.add_edge("get_apmcs", "select_apmc_and_commodity")
# builder.add_edge("select_apmc_and_commodity", "fetch_trade")
# builder.add_edge("fetch_trade", END)
#
# graph = builder.compile()


from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, END
from typing import TypedDict, List, Optional
from pydantic import BaseModel

from ajrasakha.tools.market import *
from ajrasakha.tools.location import *

# ---- LLM ----
llm = ChatAnthropic(model="claude-sonnet-4-5-20250929")

# ---- STRUCTURED QUERY ----
class QuerySchema(BaseModel):
    state: str | None
    commodity: str
    latitude: float | None
    longitude: float | None

parse_llm = llm.with_structured_output(QuerySchema)

# ---- STATE ----
class State(TypedDict):
    query: str
    latitude: Optional[float]
    longitude: Optional[float]
    state_name: Optional[str]
    state_id: Optional[str]
    commodity: Optional[str]
    apmc_list: List[str]
    selected_apmc: Optional[str]
    result: Optional[dict]
    done: bool

# ---- NODE 1 ----
async def parse_query(state: State):
    prompt = f"""
    Extract structured info:

    Query: {state["query"]}

    Return:
    {{
      "state": "... or null",
      "commodity": "...",
      "latitude": null or float,
      "longitude": null or float
    }}
    """
    res = await parse_llm.ainvoke(prompt)

    state["state_name"] = res.state
    state["commodity"] = res.commodity
    state["latitude"] = res.latitude
    state["longitude"] = res.longitude
    state["done"] = False

    return state

# ---- NODE 2 ----
async def resolve_location(state: State):
    if state.get("latitude") and state.get("longitude"):
        loc = await location_information_tool.ainvoke({
            "latitude": state["latitude"],
            "longitude": state["longitude"],
        })
        state["state_name"] = loc.get("state")
    return state

# ---- NODE 3 ----
async def get_state(state: State):
    res = await get_state_list_from_enam.ainvoke({})
    data = res.get("data", {}).get("data", [])

    for s in data:
        if state["state_name"] and state["state_name"].lower() in s["state_name"].lower():
            state["state_id"] = s["state_id"]
            state["state_name"] = s["state_name"]
            return state

    state["done"] = True
    state["result"] = {"error": "State not found"}
    return state

# ---- NODE 4 ----
async def get_apmcs(state: State):
    res = await get_apmc_list_from_enam.ainvoke({
        "state_id": state["state_id"]
    })

    data = res.get("data", {}).get("data", [])

    apmcs = [
        a.get("apmc_name")
        for a in data
        if isinstance(a, dict) and a.get("apmc_name")
    ]

    if not apmcs:
        state["done"] = True
        state["result"] = {"error": "No mandis found"}
        return state

    # Prefer exact city match (e.g., Guntur)
    query_lower = state["query"].lower()
    for a in apmcs:
        if a.lower() in query_lower:
            state["selected_apmc"] = a
            return state

    state["selected_apmc"] = apmcs[0]
    return state

# ---- HELPER: MULTI-MATCH COMMODITY ----
def match_commodities(user_comm, comm_list):
    user_comm = user_comm.lower()

    matches = [c for c in comm_list if user_comm in c.lower()]

    if matches:
        return matches

    # fallback: return all (LLM-like behavior but deterministic)
    return comm_list[:5]

from datetime import datetime, timedelta

def get_date_range(days_back: int):
    today = datetime.today()
    from_date = today - timedelta(days=days_back)

    return {
        "from_date": from_date.strftime("%Y-%m-%d"),
        "to_date": today.strftime("%Y-%m-%d"),
    }

# ---- NODE 5 ----
async def fetch_trade(state: State):
    apmc = state["selected_apmc"]
    date_ranges = [
        get_date_range(0),  # today
        get_date_range(1),  # last 1 day
        get_date_range(7),  # last week
        get_date_range(14),  # last 2 weeks
    ]

    comm_data = []

    for dr in date_ranges:
        comm_res = await get_commodity_list_from_enam.ainvoke({
            "state_name": state["state_name"],
            "apmc_name": apmc,
            "from_date": dr["from_date"],
            "to_date": dr["to_date"],
        })

        print("data being sent")
        print({
            "state_name": state["state_name"],
            "apmc_name": apmc,
            "from_date": dr["from_date"],
            "to_date": dr["to_date"],
        })

        print("COMM____RESPOSNE")
        print(comm_res)
        comm_data = comm_res.get("data", {}).get("data", [])

        print("COMM____DATA")
        print(comm_data)

        if comm_data:
            break

    if comm_data == []:
        state["done"] = True
        state["result"] = {"error": f"No commodities in {apmc}"}
        return state

    comm_list = [
        c.get("commodity")
        for c in comm_data
        if isinstance(c, dict) and c.get("commodity")
    ]

    matched = match_commodities(state["commodity"], comm_list)

    if not matched:
        state["done"] = True
        state["result"] = {"error": "No matching commodity"}
        return state

    # ---- TRY ALL MATCHES ----
    best_result = None
    best_price = -1

    for commodity in matched:
        trade_data = None

        for dr in date_ranges:
            trade = await get_trade_data_from_enam.ainvoke({
                "state_name": state["state_name"],
                "apmc_name": apmc,
                "commodity_name": commodity,
                "from_date": dr["from_date"],
                "to_date": dr["to_date"],
            })

            data = trade.get("data", {}).get("data")

            if data:
                trade_data = data
                break

        if not trade_data:
            continue

        for row in trade_data:
            price = int(row.get("modal_price", 0))
            if price > best_price:
                best_price = price
                best_result = {
                    "apmc": apmc,
                    "commodity": commodity,
                    "date_from": dr["from_date"],
                    "date_to": dr["to_date"],
                    "data": row,
                }

    if best_result:
        state["result"] = best_result
    else:
        state["result"] = {"error": "No trade data found"}

    state["done"] = True
    return state

# ---- GRAPH ----
builder = StateGraph(State)

builder.add_node("parse_query", parse_query)
builder.add_node("resolve_location", resolve_location)
builder.add_node("get_state", get_state)
builder.add_node("get_apmcs", get_apmcs)
builder.add_node("fetch_trade", fetch_trade)

builder.set_entry_point("parse_query")

builder.add_edge("parse_query", "resolve_location")
builder.add_edge("resolve_location", "get_state")
builder.add_edge("get_state", "get_apmcs")
builder.add_edge("get_apmcs", "fetch_trade")
builder.add_edge("fetch_trade", END)

graph = builder.compile()