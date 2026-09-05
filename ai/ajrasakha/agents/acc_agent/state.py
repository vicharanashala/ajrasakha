from typing import TypedDict, Optional
from ajrasakha.agents.state import Location
from ajrasakha.agents.acc_agent.extraction import ExtractedQuery, ExtractionType


class AccAgentState(TypedDict):
    # Initial input
    transcript: str
    extraction_type: ExtractionType
    
    # Extracted values (pending human verification)
    extracted_state: Optional[str]
    extracted_district: Optional[str]
    extracted_queries: list[ExtractedQuery]

    # Farmer profile fields (from transcript when mentioned)
    extracted_name: Optional[str]
    extracted_phone: Optional[str]
    extracted_age: Optional[int]
    extracted_gender: Optional[str]
    extracted_village: Optional[str]
    extracted_block: Optional[str]
    extracted_primary_crop: Optional[str]
    extracted_secondary_crops: list[str]
    extracted_language_preference: Optional[str]
    extracted_years_of_experience: Optional[int]
    extracted_highest_education: Optional[str]
    extracted_smartphones_at_home: Optional[int]
    
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
