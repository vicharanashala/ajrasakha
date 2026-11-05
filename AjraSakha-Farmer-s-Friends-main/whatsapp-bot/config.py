import os
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv

load_dotenv()

from shared.utils import Config

class TwilioConfig:
    ACCOUNT_SID = Config.TWILIO_ACCOUNT_SID or os.getenv("TWILIO_ACCOUNT_SID", "")
    AUTH_TOKEN = Config.TWILIO_AUTH_TOKEN or os.getenv("TWILIO_AUTH_TOKEN", "")
    WHATSAPP_NUMBER = Config.TWILIO_WHATSAPP_NUMBER or os.getenv("TWILIO_WHATSAPP_NUMBER", "")

    @classmethod
    def is_configured(cls):
        return all([cls.ACCOUNT_SID, cls.AUTH_TOKEN, cls.WHATSAPP_NUMBER])