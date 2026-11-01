import os

class Settings:
    PROJECT_NAME: str = "AJRASAKHA PS-5 FEEDBACK SUITE"
    VERSION: str = "2.0.0"
    API_V1_PREFIX: str = "/api"
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "ajrasakha_db")
    
    # Statistical Flagging Pipeline Parameters
    FLAG_HELPFUL_THRESHOLD: float = float(os.getenv("FLAG_HELPFUL_THRESHOLD", "0.60")) # < 60%
    FLAG_MIN_RESPONSES: int = int(os.getenv("FLAG_MIN_RESPONSES", "10")) # Minimum 10 responses
    
    # Agro-Chrono Scheduling Window (Evening Chilling Hours)
    CHRONO_LEISURE_START_HOUR: int = 19 # 7:00 PM
    CHRONO_LEISURE_END_HOUR: int = 21   # 9:00 PM
    FEEDBACK_DAY_TIMEOUT_MINS: int = 120 # 2 hours before scheduling evening nudge

settings = Settings()
