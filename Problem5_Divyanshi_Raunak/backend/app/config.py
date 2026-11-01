import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    # Look for .env in project root and backend folder
    root_dir = Path(__file__).resolve().parent.parent.parent
    backend_dir = root_dir / "backend"
    for env_path in [root_dir / ".env", backend_dir / ".env"]:
        if env_path.exists():
            load_dotenv(env_path)
            break
except ImportError:
    pass

class Settings:
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "AJRASAKHA PS-5 FEEDBACK SUITE")
    VERSION: str = "2.0.0"
    API_V1_PREFIX: str = "/api"
    
    # Server configuration
    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "127.0.0.1")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
    
    # Database
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "ajrasakha_db")
    
    # Statistical Flagging Pipeline Parameters
    FLAG_HELPFUL_THRESHOLD: float = float(os.getenv("FLAG_HELPFUL_THRESHOLD", "0.60")) # < 60%
    FLAG_MIN_RESPONSES: int = int(os.getenv("FLAG_MIN_RESPONSES", "10")) # Minimum 10 responses
    
    # APScheduler Daily Cron Job (Flagging Scan in IST)
    CRON_FLAGGING_HOUR: int = int(os.getenv("CRON_FLAGGING_HOUR", "2")) # 2:00 AM IST
    CRON_FLAGGING_MINUTE: int = int(os.getenv("CRON_FLAGGING_MINUTE", "0"))
    
    # Agro-Chrono Scheduling Window (Evening Chilling Hours)
    CHRONO_LEISURE_START_HOUR: int = int(os.getenv("CHRONO_LEISURE_START_HOUR", "19")) # 7:00 PM
    CHRONO_LEISURE_END_HOUR: int = int(os.getenv("CHRONO_LEISURE_END_HOUR", "21"))   # 9:00 PM
    FEEDBACK_DAY_TIMEOUT_MINS: int = int(os.getenv("FEEDBACK_DAY_TIMEOUT_MINS", "120")) # 2 hours before scheduling evening nudge

    # NVIDIA Build API (NIM Integration)
    NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY", "")
    NVIDIA_BASE_URL: str = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    NVIDIA_MODEL: str = os.getenv("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct")

    # Twilio WhatsApp API Configuration
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_NUMBER: str = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")

settings = Settings()

