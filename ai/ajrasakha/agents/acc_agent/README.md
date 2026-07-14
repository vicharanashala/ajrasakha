# ACC Agent (Agricultural Call Center Agent)

A LangGraph-based agent for handling agricultural queries from farmers via call centers.

## Overview

The ACC Agent processes farmer transcripts, extracts key information, routes queries to appropriate sub-agents (GDB, Weather, Market, Schemes), and generates structured JSON responses for call center agents.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Transcript │────▶│   Extract   │────▶│  HITL Verification│────▶│   Planner   │
│   Input     │     │    Node     │     │     (Pause)       │     │    Node     │
└─────────────┘     └─────────────┘     └──────────────────┘     └──────┬──────┘
                                                                          │
                    ┌──────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Tool Execution Node                               │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                              │
│  │   GDB   │    │ Weather │    │ Market  │   (Parallel Execution)        │
│  │ Agent   │    │ Agent   │    │ Agent   │                              │
│  └────┬────┘    └────┬────┘    └────┬────┘                              │
└───────┼──────────────┼──────────────┼────────────────────────────────────┘
        │              │              │
        └──────────────┴──────────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │    Assembler    │
                 │      Node       │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │  Final JSON     │
                 │    Output       │
                 └─────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `state.py` | TypedDict state schema with all fields for the agent |
| `prompts.py` | LLM prompts for extraction, planning, and assembly |
| `nodes.py` | LangGraph node implementations (extract, planner, tool_execution, assembler) |
| `graph.py` | LangGraph workflow definition with edges and interrupts |
| `__init__.py` | Module exports |

## State Schema

```python
class AccAgentState(TypedDict):
    # Initial input
    transcript: str                    # Farmer's call transcript
    
    # Extracted values (pending human verification)
    extracted_query: Optional[str]     # Cleaned agricultural query
    extracted_state: Optional[str]     # Indian state
    extracted_district: Optional[str]  # District
    extracted_crop: Optional[str]      # Crop name
    standardized_domains: list[str]    # Domain classification(s)
    
    # Verified and merged location structure
    location: Optional[Location]
    
    # State tracking
    verified_by_human: bool            # HITL approval flag
    
    # Tool execution - multi-tool routing
    selected_tools: list[str]          # Tools to call (gdb, weather, market, schemes)
    
    # Individual tool responses
    gdb_response: Optional[str]        # Raw GDB response
    weather_response: Optional[str]    # Raw Weather response
    market_response: Optional[str]     # Raw Market response
    schemes_response: Optional[str]    # Raw Schemes response
    
    # Final output
    final_answer: Optional[str]        # JSON output with all sections
```

## Workflow

### 1. Extract Node
- Receives farmer transcript
- Uses LLM to extract:
  - `extracted_query`: Clean query text
  - `extracted_state`: Indian state
  - `extracted_district`: District
  - `extracted_crop`: Crop name
  - `standardized_domains`: Domain classification(s) from 22 standard domains

### 2. HITL Verification (Interrupt)
- Graph pauses after extraction
- Call center agent reviews extracted values
- Can approve or modify values
- Resumes with verified data

### 3. Planner Node
- Receives verified extracted values
- Determines which tools to call:
  - `gdb`: Farming practices, diseases, pests, fertilizers
  - `weather`: Weather forecasts, rainfall
  - `market`: Market prices, MSP
  - `schemes`: Government schemes, subsidies, yojanas, farmer benefits
- Returns `selected_tools` array (can be multiple)

### 4. Tool Execution Node
- Executes selected tools in **parallel**
- Collects responses from each tool
- Returns individual response fields

### 5. Assembler Node
- Parses tool responses (JSON or string)
- Generates human-readable `final_answer`
- Returns structured JSON output

## Standardized Domains

The agent classifies queries into these 22 domains:

1. Soil Health and Nutrient Management
2. Irrigation and Water Management
3. Insect - Pest Management
4. Disease Management
5. Seed and Variety Selection
6. Cultural and Crop Management Practices
7. Organic and Natural Farming
8. Weed Management
9. Climate, Weather & Stress Management
10. Farm Tools & Mechanisation
11. Post-Harvest Management & Storage
12. Market Prices, MSP & Marketing
13. Agricultural Schemes & Subsidies
14. Credit, Loan & Insurance
15. Capacity Building & Extension
16. Rural Infrastructure
17. Animal Husbandry & Livestock
18. Fisheries & Aquaculture
19. Horticulture & Landscaping
20. Allied Agricultural Activities
21. Others
22. NA / Invalid Data

## Output Format

```json
{
  "gdb": {
    "rephrased_query": "...",
    "similar_pair1": {
      "question": "...",
      "answer": "...",
      "details": [...]
    }
  },
  "weather": {
    "success": true,
    "data_type": "forecast",
    "result": {...}
  },
  "market": {
    "query_context": {...},
    "agmarknet": {...}
  },
  "final_answer": "Human-readable response for call center agent"
}
```

## Usage

```python
from ajrasakha.agents.acc_agent import acc_graph

# Initialize state
initial_state = {
    "transcript": "Farmer: Namaste ji, main Punjab se bol raha hoon..."
}

# Run graph with checkpointer
config = {"configurable": {"thread_id": "unique-thread-id"}}

# First run - until HITL interrupt
async for event in acc_graph.astream(initial_state, config=config):
    for node_name, state_update in event.items():
        print(f"Finished: {node_name}")

# After human verification, resume
async for event in acc_graph.astream(None, config=config):
    for node_name, state_update in event.items():
        print(f"Finished: {node_name}")

# Get final result
final_state = acc_graph.get_state(config)
print(final_state.values.get("final_answer"))
```

## Dependencies

- `langgraph` - Graph workflow framework
- `langchain_anthropic` - Anthropic LLM integration
- `ajrasakha.agents.gdb_agent` - GDB sub-agent
- `ajrasakha.agents.weather_agent` - Weather sub-agent
- `ajrasakha.agents.market_agent` - Market sub-agent

## Configuration

Environment variables required:
- `ANTHROPIC_API_KEY` - For LLM calls
- Sub-agent API endpoints (configured in respective agents)
