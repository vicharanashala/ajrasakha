# Mandi Daily Market Price & Arrival Service (`daily_market_price.py`)

A high-performance **Model Context Protocol (MCP)** tool designed to query, aggregate, compare, and rank agricultural commodity prices and arrival volumes across India's APMC mandis (markets).

The service exposes a unified MCP tool endpoint (`mandi_price_tool`) powered by [`FastMCP`](https://github.com/jlowin/fastmcp) over **Streamable HTTP transport**. It interfaces with a MongoDB database containing millions of historical and real-time market records from sources such as **Agmarknet** and **eNAM**.

> 📖 **Looking for a non-technical overview?** Check out the [Plain English User Guide (`USER_GUIDE.md`)](file:///home/kishar/ajrasakha/ai/ajrasakha/tools/daily_price/USER_GUIDE.md) for layman descriptions, everyday farmer use cases, and market terminology.

---

## Table of Contents

1. [Architectural Overview](#architectural-overview)
2. [Database Schema & Data Model](#database-schema--data-model)
3. [Core Workflows & Processing Flowcharts](#core-workflows--processing-flowcharts)
   - [Main Request Dispatch & Execution Pipeline](#main-request-dispatch--execution-pipeline)
   - [Location Priority Cascade Flowchart](#location-priority-cascade-flowchart)
   - [Commodity Alias Resolution Pipeline](#commodity-alias-resolution-pipeline)
   - [Composite Action Workflow (`get_price_with_nearby`)](#composite-action-workflow-get_price_with_nearby)
4. [Tool API Reference (`mandi_price_tool`)](#tool-api-reference-mandi_price_tool)
   - [Input Parameters](#input-parameters)
   - [Supported Actions Summary](#supported-actions-summary)
5. [Detailed Action Breakdown & Examples](#detailed-action-breakdown--examples)
   - [1. `get_today_price`](#1-get_today_price)
   - [2. `get_price_history`](#2-get_price_history)
   - [3. `get_price_summary`](#3-get_price_summary)
   - [4. `get_highest_price`](#4-get_highest_price)
   - [5. `get_lowest_price`](#5-get_lowest_price)
   - [6. `get_today_arrival`](#6-get_today_arrival)
   - [7. `get_arrival_history`](#7-get_arrival_history)
   - [8. `get_extreme_arrival`](#8-get_extreme_arrival)
   - [9. `search_markets`](#9-search_markets)
   - [10. `get_price_with_nearby`](#10-get_price_with_nearby)
6. [Internal Engineering & Optimization Mechanisms](#internal-engineering--optimization-mechanisms)
   - [State-First Haversine Geolocation (No `$near` Hanging)](#state-first-haversine-geolocation-no-near-hanging)
   - [State Synonyms & Standardization](#state-synonyms--standardization)
   - [Multi-Format Date Parsing & Lookback Logic](#multi-format-date-parsing--lookback-logic)
   - [Latest Price / Arrival Fallback Mechanism](#latest-price--arrival-fallback-mechanism)
   - [Multi-Action Batch Execution](#multi-action-batch-execution)
   - [Source System Normalization](#source-system-normalization)
7. [Configuration & Environment Variables](#configuration--environment-variables)
8. [Setup, Deployment & Testing](#setup-deployment--testing)
   - [Local Development Setup](#local-development-setup)
   - [Docker & Docker Compose Deployment](#docker--docker-compose-deployment)
   - [Running Tests](#running-tests)

---

## Architectural Overview

The daily market price tool is built around the following technical tenets:

```
                  +----------------------------------------------+
                  |           LLM Agent / MCP Client             |
                  +----------------------------------------------+
                                         |
                                         | JSON-RPC / Streamable HTTP (Port 8006)
                                         v
                  +----------------------------------------------+
                  |         FastMCP Server: mandi_price_tool     |
                  +----------------------------------------------+
                                         |
            +----------------------------+----------------------------+
            |                            |                            |
            v                            v                            v
   +--------------------+      +--------------------+      +--------------------+
   |  State & Alias     |      | Location Priority  |      | Date & Range       |
   |  Normalizer        |      | Cascade Engine     |      | Analyzer           |
   +--------------------+      +--------------------+      +--------------------+
            |                            |                            |
            +----------------------------+----------------------------+
                                         |
                                         v
                  +----------------------------------------------+
                  |               MongoDB Database               |
                  |                (Database: Price)             |
                  +----------------------------------------------+
                     |             |             |             |
                     v             v             v             v
             commodity_alias  available_     markets_       price_
                 _lookup         mandi     commodities     records
```

### Key Highlights
- **Single Tool Surface:** Exposes 1 consolidated tool (`mandi_price_tool`) with 10 specialized actions, reducing LLM tool confusion and schema bloat.
- **Batch Action Support:** Accepts either a single action string or a list of up to 3 actions in a single round-trip.
- **Resilient Geolocation:** Eliminates standard MongoDB `$near` index latency bottlenecks on large collections by pre-filtering by state exact keys and performing in-memory spherical Haversine distance ranking.
- **Graceful Fallbacks:** If records are missing for today or a specific date, the engine automatically falls back to the latest recorded price/arrival and includes clear metadata annotations.

---

## Database Schema & Data Model

The service connects to the `Price` MongoDB database across 4 collections:

```mermaid
erDiagram
    COMMODITY_ALIAS_LOOKUP ||--o{ MARKETS_COMMODITIES : "commodity_alias_lookup_id"
    AVAILABLE_MANDI ||--o{ MARKETS_COMMODITIES : "market_id"
    MARKETS_COMMODITIES ||--o{ PRICE_RECORDS : "market_commodity_id"

    COMMODITY_ALIAS_LOOKUP {
        ObjectId _id PK
        string canonical_name
        list aliases
        boolean active
    }

    AVAILABLE_MANDI {
        ObjectId _id PK
        string name
        string state
        string district
        string postcode
        list aliases
        object location "GeoJSON Point [longitude, latitude]"
    }

    MARKETS_COMMODITIES {
        ObjectId _id PK
        ObjectId market_id FK
        ObjectId commodity_alias_lookup_id FK
        string state
        string commodity_name
        string variety
        string grade
        string commodity_group
        string source_url
        string source_system
    }

    PRICE_RECORDS {
        ObjectId _id PK
        ObjectId market_commodity_id FK
        datetime date
        double modal_price
        double min_price
        double max_price
        double arrival_quantity
    }
```

### Collection Details

| Collection Name | Purpose | Key Query Fields |
| :--- | :--- | :--- |
| `commodity_alias_lookup` | Standardizes commodity names from local names, dialects, and misspellings to canonical IDs. | `canonical_name`, `aliases`, `active` |
| `available_mandi` | Master list of all registered mandis/APMCs with geospatial WGS-84 coordinates. | `state`, `name`, `aliases`, `location.coordinates` |
| `markets_commodities` | Relationship map associating a specific mandi with a commodity, variety, and data source. | `commodity_alias_lookup_id`, `market_id`, `state` |
| `price_records` | High-volume time-series collection storing daily price (Min, Max, Modal in ₹/Quintal) and arrival volume. | `market_commodity_id`, `date` |

---

## Core Workflows & Processing Flowcharts

### Main Request Dispatch & Execution Pipeline

```mermaid
flowchart TD
    Start([Client calls mandi_price_tool]) --> ParseInput[Normalize Action, Commodity, Market, and State]
    ParseInput --> ValidateState{Is 'state' provided?}
    
    ValidateState -- No --> ErrState[Return error: 'state name is not present']
    ValidateState -- Yes --> ActionType{Single Action or List?}
    
    ActionType -- Multi (List) --> LoopActions[Iterate through actions up to MAX_ACTIONS=3]
    ActionType -- Single --> ExecDispatch[Dispatch action handler]
    
    LoopActions --> ExecDispatch
    
    ExecDispatch --> ResolveAlias[Resolve Commodity Aliases in commodity_alias_lookup]
    ResolveAlias --> AliasFound{Aliases Found?}
    
    AliasFound -- No --> ErrAlias[Return error: 'We do not have commodity available in state']
    AliasFound -- Yes --> CheckNamed{Explicit market_name provided?}
    
    CheckNamed -- Yes --> MatchNamedMarket[Search market in available_mandi & find matching markets_commodities]
    CheckNamed -- No --> MatchStateCrops[Filter markets_commodities by state + commodity_alias_id]
    
    MatchNamedMarket --> FilterDates[Apply Date Filter on price_records]
    MatchStateCrops --> FilterDates
    
    FilterDates --> LocationCascade[Execute Location Priority Cascade]
    LocationCascade --> FetchRecords[Query price_records sorted by date DESC with limit=100]
    
    FetchRecords --> HasRows{Price rows found?}
    HasRows -- Yes --> FormatResult[Serialize records, compute statistics & build metadata]
    HasRows -- No --> CheckFallback{latest_price_fallback enabled & date filter active?}
    
    CheckFallback -- Yes --> FetchLatest[Re-run query without date filter for latest available date]
    CheckFallback -- No --> ReturnEmpty[Return resolution with empty or error status]
    
    FetchLatest --> AddNotice[Add latest_price_notice to resolution]
    AddNotice --> FormatResult
    
    FormatResult --> Output([Return JSON Response])
    ReturnEmpty --> Output
    ErrState --> Output
    ErrAlias --> Output
```

---

### Location Priority Cascade Flowchart

When fetching price data for a general query (without a strict named market lock), the engine attempts 3 location tiers sequentially, stopping at the first tier that yields valid records:

```mermaid
flowchart TD
    StartCascade([Start Location Priority Cascade]) --> Tier1[Priority Tier 1: Named Mandi]
    
    Tier1 --> T1Check{Was market_name specified and matched?}
    T1Check -- Yes --> T1Query[Query price_records for specific mandi]
    T1Query --> T1Found{Records found?}
    T1Found -- Yes --> Success1[Set selection_mode = 'priority_market_name' & Return]
    T1Found -- No --> Tier2
    T1Check -- No --> Tier2
    
    Tier2[Priority Tier 2: Lat/Long Nearest Ranking]
    Tier2 --> T2Check{Are lat & long provided?}
    T2Check -- Yes --> T2Haversine[Rank candidate mandis by Haversine distance within radius_km]
    T2Haversine --> T2Query[Query price_records for top N nearest mandis]
    T2Query --> T2Found{Records found?}
    T2Found -- Yes --> Success2[Set selection_mode = 'priority_lat_long' & Return]
    T2Found -- No --> Tier3
    T2Check -- No --> Tier3
    
    Tier3[Priority Tier 3: State-Wide Aggregate]
    Tier3 --> T3Query[Query price_records across all mandis in state trading crop]
    T3Query --> T3Found{Records found?}
    T3Found -- Yes --> Success3[Set selection_mode = 'priority_state' & Return with Fallback Notice]
    T3Found -- No --> Failed([No records found across all stages])
```

---

### Commodity Alias Resolution Pipeline

```mermaid
flowchart LR
    RawInput[Input Commodity Name: e.g., 'Pyaz', 'Kanda', 'Onion'] --> Norm[Clean whitespace & lowercase]
    Norm --> ExactLookup[Query 1: Exact canonical_name or aliases]
    ExactLookup --> ExactHit{Found?}
    
    ExactHit -- Yes --> Done[Return matching commodity docs & alias IDs]
    ExactHit -- No --> RegexLookup[Query 2: Regex exact match with flexible trailing whitespace]
    RegexLookup --> RegexHit{Found?}
    
    RegexHit -- Yes --> Done
    RegexHit -- No --> WordBoundaryLookup[Query 3: Word-boundary regex fallback]
    WordBoundaryLookup --> WbHit{Found?}
    
    WbHit -- Yes --> Done
    WbHit -- No --> Unresolved[Add to unresolved_commodities list]
```

---

### Composite Action Workflow (`get_price_with_nearby`)

```mermaid
sequenceDiagram
    autonumber
    actor Client as LLM Agent / User
    participant MCP as mandi_price_tool
    participant DB as MongoDB

    Client->>MCP: action="get_price_with_nearby", market_name="Azadpur", commodity_name="Tomato", state="Delhi"
    MCP->>DB: Query named mandi ("Azadpur") coordinates & prices
    DB-->>MCP: Azadpur price record + Geo coords [77.17, 28.71]
    MCP->>DB: Query all mandis within 100km radius of Azadpur coords
    DB-->>MCP: Candidate nearby mandis (e.g., Ghazipur, Okhla, Narela)
    MCP->>DB: Fetch prices for candidate nearby mandis
    DB-->>MCP: Nearby mandi price records
    MCP->>MCP: Filter out Azadpur from nearby records & cap to top 5 nearest
    MCP-->>Client: Structured composite JSON (named_market + nearby_markets)
```

---

## Tool API Reference (`mandi_price_tool`)

The tool is decorated with `@mcp.tool()` and acts as the single unified interface for all market inquiries.

### Input Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `action` | `str \| list[str]` | **Yes** | — | Single action string or a list of up to 3 action strings. |
| `commodity_name` | `str \| list[str]` | Conditional | `None` | Name(s) of the agricultural crop (e.g. `"Potato"`, `["Wheat", "Gram"]`). Required for all price/arrival actions. |
| `state` | `str` | **Yes** | `None` | Standardized Indian State name (e.g. `"Maharashtra"`, `"Uttar Pradesh"`, `"Delhi"`). Case-insensitive. |
| `market_name` | `str` | Optional | `None` | Free-text mandi / APMC name or alias (e.g. `"Azadpur"`, `"Nashik Mandi"`). |
| `lat` | `float` | Optional | `None` | Latitude in decimal degrees (WGS-84) for nearest mandi ranking. |
| `long` | `float` | Optional | `None` | Longitude in decimal degrees (WGS-84) for nearest mandi ranking. |
| `nearest_market` | `bool` | Optional | `False` | If `True`, returns up to top 5 nearest markets; if `False`, returns only the 1 closest. |
| `radius_km` | `float` | Optional | `None` | Maximum distance filter in kilometers from `lat`/`long`. |
| `from_date` | `str` | Optional | `None` | Inclusive start date (supports `27-Jun-2025`, `2025-06-27`, `27-06-2025`, `27-Jun`). |
| `to_date` | `str` | Optional | `None` | Inclusive end date for range queries. |
| `lookback_days` | `int` | Optional | `None` | Fetches records for the past N calendar days up to today. Takes precedence over `from_date`/`to_date`. |
| `sort_by` | `str` | Optional | `None` | Field selector for extreme ranking queries (`"price"` or `"arrival"`). |
| `sort_order` | `str` | Optional | `None` | Direction for extreme queries (`"highest"` or `"lowest"`). |

---

### Supported Actions Summary

```
+------------------------+-------------------------------------------------------------------------+
| Action Name            | Primary Intent                                                          |
+------------------------+-------------------------------------------------------------------------+
| get_today_price        | Get latest/today's price for a crop (with latest fallback notice).       |
| get_price_history      | Get historical price records over a date range or lookback period.       |
| get_price_summary      | Get statistical averages (min/max/modal), spreads, and source metadata.  |
| get_highest_price      | Identify the mandi with the highest price for maximum farmer profit.    |
| get_lowest_price       | Identify the mandi with the cheapest/lowest non-zero price.             |
| get_today_arrival      | Get today's/latest crop arrival volumes (in tonnes/quintals).           |
| get_arrival_history    | Get arrival volume trends over a date range.                            |
| get_extreme_arrival    | Get top 5 mandis with the highest or lowest arrival volumes.            |
| search_markets         | Search and discover APMC mandis by name, state, or proximity.           |
| get_price_with_nearby  | Composite action: Get named mandi price + top nearby market prices.     |
+------------------------+-------------------------------------------------------------------------+
```

---

## Detailed Action Breakdown & Examples

### 1. `get_today_price`
Retrieves today's price record for a commodity. If today has no records logged yet, automatically provides the most recent price record accompanied by an informative fallback message.

#### Example Call:
```python
mandi_price_tool(
    action="get_today_price",
    commodity_name="Onion",
    state="Maharashtra",
    market_name="Lasalgaon"
)
```

#### Example Output:
```json
{
  "action": "get_today_price",
  "price_records": [
    {
      "date": "2025-06-27",
      "state": "Maharashtra",
      "market_name": "Lasalgaon",
      "district": "Nashik",
      "commodity_name": "Onion",
      "variety": "Red",
      "grade": "FAQ",
      "commodity_group": "Vegetables",
      "source_url": "https://agmarknet.gov.in/...",
      "source_system": "Agmarknet",
      "modal_price": 2450.0,
      "min_price": 1800.0,
      "max_price": 2800.0,
      "arrival_quantity": 420.5
    }
  ],
  "total_records_returned": 1,
  "resolution": {
    "requested_market_name": "Lasalgaon",
    "selection_mode": "priority_market_name",
    "location_priority_tried": ["market_name"],
    "location_priority_used": "market_name",
    "latest_price_notice": "Today's price is not available. Showing the latest available price (as of 2025-06-27)."
  }
}
```

---

### 2. `get_price_history`
Returns historical day-by-day price records over a specified timeframe.

#### Example Call:
```python
mandi_price_tool(
    action="get_price_history",
    commodity_name="Wheat",
    state="Madhya Pradesh",
    market_name="Indore",
    from_date="01-Jun-2025",
    to_date="15-Jun-2025"
)
```

#### Output Schema:
- `price_records`: Array of serialized price records sorted by date descending (up to 15 items displayed in primary list).
- `total_records_returned`: Total matching rows found.
- `resolution`: Date filter metadata (`mode`: `"range"`, `from_date`, `to_date`).

---

### 3. `get_price_summary`
Computes statistical aggregates over the matched records, including average modal price, lowest min price, highest max price, price spread (volatility), and total arrival volumes.

#### Example Call:
```python
mandi_price_tool(
    action="get_price_summary",
    commodity_name="Tomato",
    state="Karnataka",
    lookback_days=14
)
```

#### Example Output:
```json
{
  "action": "get_price_summary",
  "source_system": "Agmarknet",
  "total_records_analysed": 28,
  "stats": {
    "total_records": 28,
    "overall": {
      "avg_min_price": 1250.4,
      "avg_max_price": 2100.8,
      "avg_modal_price": 1725.0,
      "lowest_min_price": 900.0,
      "highest_max_price": 2600.0,
      "price_spread": 1700.0,
      "avg_arrival_qty": 35.6,
      "total_arrival_qty": 996.8
    },
    "by_commodity": {
      "Tomato": {
        "record_count": 28,
        "avg_min_price": 1250.4,
        "avg_max_price": 2100.8,
        "avg_modal_price": 1725.0,
        "lowest_min_price": 900.0,
        "highest_max_price": 2600.0,
        "total_arrival_qty": 996.8
      }
    }
  },
  "resolution": {
    "selection_mode": "priority_state",
    "location_priority_used": "state"
  }
}
```

---

### 4. `get_highest_price` & 5. `get_lowest_price`
Finds the single best (highest modal/max) or cheapest (lowest non-zero modal/min) market price record across the region. Defaults to a 7-day lookback window if no date is specified.

#### Example Call (`get_highest_price`):
```python
mandi_price_tool(
    action="get_highest_price",
    commodity_name="Mustard",
    state="Rajasthan"
)
```

#### Output Structure:
```json
{
  "action": "get_highest_price",
  "highest_records": [
    {
      "date": "2025-06-25",
      "market_name": "Kota",
      "state": "Rajasthan",
      "district": "Kota",
      "commodity_name": "Mustard",
      "modal_price": 5850.0,
      "min_price": 5400.0,
      "max_price": 6100.0
    }
  ],
  "total_records_analysed": 45,
  "resolution": { ... }
}
```

---

### 6. `get_today_arrival` & 7. `get_arrival_history`
Specialized actions focusing exclusively on quantity metrics. Strips out raw price fields and returns aggregated arrival totals and averages.

#### Output Structure (`get_today_arrival`):
```json
{
  "action": "get_today_arrival",
  "arrival_records": [
    {
      "date": "2025-06-27",
      "market_name": "Azadpur",
      "state": "NCT of Delhi",
      "district": "Delhi",
      "commodity_name": "Apple",
      "variety": "Delicious",
      "arrival_quantity": 185.0,
      "source_system": "Agmarknet"
    }
  ],
  "total_arrival_qty": 185.0,
  "avg_arrival_qty": 185.0,
  "total_records_returned": 1,
  "resolution": { ... }
}
```

---

### 8. `get_extreme_arrival`
Sorts arrival volumes across candidate markets and returns the top 5 highest or lowest arrivals.

#### Example Call:
```python
mandi_price_tool(
    action="get_extreme_arrival",
    commodity_name="Cotton",
    state="Gujarat",
    sort_order="highest",
    lookback_days=7
)
```

---

### 9. `search_markets`
Searches available mandis within a state without requiring price records. Supports name tokens and GPS proximity ranking.

#### Example Call:
```python
mandi_price_tool(
    action="search_markets",
    state="Kerala",
    market_name="Angamaly",
    lat=10.196,
    long=76.386,
    nearest_market=True
)
```

#### Example Output:
```json
{
  "action": "search_markets",
  "count": 1,
  "mode": "state_then_distance",
  "markets": [
    {
      "name": "Angamaly",
      "state": "Kerala",
      "district": "Ernakulam",
      "postcode": "683572",
      "aliases": ["Angamali APMC"],
      "coordinates": {
        "latitude": 10.1965,
        "longitude": 76.3860
      }
    }
  ]
}
```

---

### 10. `get_price_with_nearby`
A composite action tailored for farmer decision-making: provides the price at the farmer's target local mandi alongside comparative prices from neighboring mandis within a 100km radius.

#### Example Call:
```python
mandi_price_tool(
    action="get_price_with_nearby",
    commodity_name="Paddy(Dhan)(Common)",
    market_name="Karnal",
    state="Haryana"
)
```

#### Example Output:
```json
{
  "action": "get_price_with_nearby",
  "named_market": {
    "action": "get_today_price",
    "price_records": [
      {
        "date": "2025-06-26",
        "market_name": "Karnal",
        "district": "Karnal",
        "commodity_name": "Paddy(Dhan)(Common)",
        "modal_price": 2320.0
      }
    ],
    "total_records_returned": 1,
    "resolution": { ... }
  },
  "nearby_markets": {
    "action": "nearby_markets_price",
    "price_records": [
      {
        "date": "2025-06-26",
        "market_name": "Gharaunda",
        "district": "Karnal",
        "modal_price": 2360.0
      },
      {
        "date": "2025-06-26",
        "market_name": "Panipat",
        "district": "Panipat",
        "modal_price": 2340.0
      }
    ],
    "total_records_returned": 2,
    "resolution": {
      "selection_mode": "priority_lat_long",
      "location_priority_used": "lat_long"
    }
  }
}
```

---

## Internal Engineering & Optimization Mechanisms

### State-First Haversine Geolocation (No `$near` Hanging)
In traditional MongoDB spatial architectures, `$near` queries execute spherical index scans across the whole collection. Under high concurrency and large collections, this causes unindexed stalls and connection timeouts.

`daily_market_price.py` implements an optimized two-stage pipeline:
1. **Database Narrowing:** Filters `available_mandi` by exact lowercase `state` (an indexed B-Tree string match) capped by `MAX_CANDIDATE_MARKETS` (default 500).
2. **In-Memory Haversine Ranking:** The exact great-circle distance is calculated in Python via:
   $$\Delta\sigma = 2 \arcsin \sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}$$
   $$d = R \cdot \Delta\sigma \quad (\text{where } R = 6371.0\text{ km})$$
3. Results are sorted in memory and sliced to `DEFAULT_TOP_N_NEAREST` or the single closest mandi.

---

### State Synonyms & Standardization
To bridge cross-collection naming discrepancies (e.g. `"delhi"` vs `"nct of delhi"`), the service uses a normalized synonym lookup:

```python
_STATE_SYNONYMS = {
    "delhi": ("delhi", "nct of delhi"),
    "nct of delhi": ("delhi", "nct of delhi"),
    "kerala": ("kerala", "keralam"),
    "keralam": ("kerala", "keralam"),
    "pondicherry": ("puducherry", "pondicherry"),
    "puducherry": ("puducherry", "pondicherry"),
    "chhattisgarh": ("chhattisgarh", "chattisgarh"),
    "chattisgarh": ("chhattisgarh", "chattisgarh"),
}
```

---

### Multi-Format Date Parsing & Lookback Logic
Dates passed as strings are parsed via `_parse_date()` supporting 6 formats:
- `%d-%b-%Y` (e.g., `27-Jun-2025`)
- `%d-%B-%Y` (e.g., `27-June-2025`)
- `%d-%m-%Y` (e.g., `27-06-2025`)
- `%Y-%m-%d` (e.g., `2025-06-27`)
- `%d-%b` (e.g., `27-Jun` — assumes current UTC year)
- `%d-%B` (e.g., `27-June` — assumes current UTC year)

When `lookback_days` is provided, the engine generates an exact UTC cutoff datetime:
$$\text{cutoff} = \text{start\_of\_day}(\text{now}_{\text{UTC}} - (\text{lookback\_days} - 1))$$

---

### Latest Price / Arrival Fallback Mechanism
Agriculture data often suffers from reporting lags (mandis closed on weekends/holidays or delayed uploads). When a query targeting today or a specific date returns 0 rows:
1. `latest_price_fallback=True` triggers a secondary query ignoring date bounds.
2. The latest available record's date is extracted.
3. Records matching that latest date are returned with an explicit notice:
   ```
   "Today's price is not available. Showing the latest available price (as of YYYY-MM-DD)."
   ```

---

### Multi-Action Batch Execution
Clients can pass a list of actions (e.g., `action=["get_today_price", "get_price_summary"]`).
- Up to `MAX_ACTIONS` (default 3) are executed sequentially.
- Errors in one action do not abort other actions.
- Returns a structured dictionary:
  ```json
  {
    "actions": ["get_today_price", "get_price_summary"],
    "results": {
      "get_today_price": { ... },
      "get_price_summary": { ... }
    }
  }
  ```

---

### Source System Normalization
Raw source strings from crawling pipelines are standardized for user-facing output:
- `"agmark"`, `"agmarknet"`, `"ajrasakhaagmark"`, `"ajrasakhaagmarknet"` $\rightarrow$ `"Agmarknet"`
- `"enam"` $\rightarrow$ `"eNAM"`
- Other sources pass through trimmed and cleaned.

---

## Configuration & Environment Variables

Create a `.env` file in this directory or configure environment variables in your container environment:

| Environment Variable | Description | Default Value |
| :--- | :--- | :--- |
| `MARKET_MONGO_URI` | MongoDB connection URI string (e.g., `mongodb://user:pass@host:27017`). | **Required** |
| `MARKET_MONGO_DB_NAME` | Target MongoDB database name. | `Price` |
| `MONGO_DB_NAME` | Secondary fallback for database name if `MARKET_MONGO_DB_NAME` is unset. | `Price` |
| `MARKET_DEFAULT_TOP_N_NEAREST` | Number of nearby mandis returned when `nearest_market=True`. | `5` |
| `MARKET_MAX_CANDIDATE_MARKETS` | Max candidate mandis loaded from state filter before in-memory distance ranking. | `500` |
| `MARKET_MAX_ACTIONS` | Maximum number of actions allowed in a single multi-action batch call. | `3` |
| `MARKET_MONGO_MAX_TIME_MS` | Server-side MongoDB cursor execution timeout in milliseconds. | `10000` (10s) |

---

## Setup, Deployment & Testing

### Local Development Setup

#### 1. Prerequisites
- Python 3.12+
- MongoDB instance with the `Price` database populated.

#### 2. Install Dependencies
```bash
cd ajrasakha/tools/daily_price
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

#### 3. Run Directly
```bash
export MARKET_MONGO_URI="mongodb://localhost:27017"
export MARKET_MONGO_DB_NAME="Price"

# Start the FastMCP service
python daily_market_price.py
```
*The service listens on port `8006` with Streamable HTTP transport by default.*

---

### Docker & Docker Compose Deployment

#### 1. Build and Run with Docker Compose
From this directory:
```bash
docker compose up --build -d
```
Or from project root:
```bash
docker compose -f ajrasakha/tools/daily_price/docker-compose.yml up --build -d
```

The container maps internal port `8006` to host port `8111`.

#### 2. Inspect Container Logs
```bash
docker logs -f daily-price-mcp
```

---

### Running Tests

Unit tests are located in the `tests/` directory:

```bash
pytest ajrasakha/tools/daily_price/tests
```

Test coverage includes:
- `test_norm_lowercases`: String trimming and lowercase normalization.
- `test_norm_commodity_name_lowercases_list`: Single and list commodity name normalization.
- `test_display_source_system_agmark_aliases`: Agmarknet alias conversions.
- `test_display_source_system_enam`: eNAM name normalization.
- `test_display_source_system_unknown_passthrough`: Graceful passthrough of custom source names.
