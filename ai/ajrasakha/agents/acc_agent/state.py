from typing import TypedDict, Optional
from ajrasakha.agents.state import Location

class AccAgentState(TypedDict):
    # Initial input
    transcript: str
    
    # Extracted values (pending human verification)
    extracted_query: Optional[str]
    extracted_state: Optional[str]
    extracted_district: Optional[str]
    extracted_crop: Optional[str]
    standardized_domains: list[str]  # NEW: Domain classification by LLM
    
    # Verified and merged location structure
    location: Optional[Location]
    
    # State tracking
    verified_by_human: bool
    
    # Tool execution - multi-tool routing
    selected_tools: list[str]
    
    # Individual tool responses
    gdb_response: Optional[str]
    weather_response: Optional[str]
    market_response: Optional[str]
    schemes_response: Optional[str]
    
    # Final output
    final_answer: Optional[str]
