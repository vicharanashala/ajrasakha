# Soil Health MCP

Server for fetching soil health data via the Soil Health GraphQL API.

## Features

- **Full Indian Language Support** - Supports all Indian languages including Hindi, Telugu, Tamil, Kannada, Marathi, Gujarati, Punjabi, Odia, Bengali, Assamese, Malayalam, and more
- **Cross-Platform Compatibility** - Works on Linux, macOS, and Windows with proper UTF-8 encoding
- **Multilingual Crop Names** - Crop registries retain both local language and English names for complete information

## Tools Available

1. **soilhealth_get_states()** - Fetch all 33 states in India
2. **soilhealth_get_districts_by_state(state_id)** - Get districts for a specific state
3. **soilhealth_get_crop_registries(state_id)** - Get available crops for a state  
4. **soilhealth_get_fertilizer_recommendations(state, n, p, k, oc, crops, district)** - Get fertilizer recommendations based on soil test results

## Multilingual Helper

The `extract_crop_display()` function is available for parsing crop names with both local and English components:

```python
from server import extract_crop_display

local_name, english_name, display = extract_crop_display("నిమ్మకాయ (Acid Lime)")
# Returns: ('నిమ్మకాయ', 'Acid Lime', 'నిమ్మకాయ (Acid Lime)')
```

## Setup

### Using Poetry (Recommended)
```bash
poetry install
poetry run python server.py
```

### Using Pip
```bash
pip install httpx python-dotenv mcp fastmcp
python server.py
```

## Local Testing CLI

You can test the server logic directly from the command line using the provided test tool. This is great for verifying connectivity and data mapping without running the full MCP server.

```bash
python test_soil_health_cli.py --state "TELANGANA" --district "ADILABAD" --crops "కంది" --n 200 --p 300 --k 200 --oc 200
```

## Troubleshooting

- **INTERNAL_SERVER_ERROR**: This usually means the portal's backend hit a timeout or an invalid ID. The server now includes automatic fallback to state-level recommendations if a district is rejected.
- **Missing Values**: Ensure all 4 soil values (N, P, K, OC) are provided as numeric inputs.
- **Connection Issues**: The server now uses standard browser headers and follows redirects to improve stability.
