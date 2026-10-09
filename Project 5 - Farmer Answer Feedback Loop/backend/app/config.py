from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List


class Settings(BaseSettings):
    # MongoDB
    mongodb_uri: str = Field("mongodb://localhost:27017", env="MONGODB_URI")
    mongodb_db_name: str = Field("farmer_feedback_db", env="MONGODB_DB_NAME")

    # GROQ
    groq_api_key: str = Field("", env="GROQ_API_KEY")
    groq_model: str = Field("llama-3.1-8b-instant", env="GROQ_MODEL")

    # WhatsApp
    whatsapp_api_token: str = Field("", env="WHATSAPP_API_TOKEN")
    whatsapp_phone_number_id: str = Field("", env="WHATSAPP_PHONE_NUMBER_ID")
    whatsapp_verify_token: str = Field("ajrasakha_feedback_webhook_2024", env="WHATSAPP_VERIFY_TOKEN")
    whatsapp_api_version: str = Field("v18.0", env="WHATSAPP_API_VERSION")

    # App
    app_host: str = Field("0.0.0.0", env="APP_HOST")
    app_port: int = Field(8000, env="APP_PORT")
    feedback_threshold: float = Field(60.0, env="FEEDBACK_THRESHOLD")
    min_responses_to_flag: int = Field(10, env="MIN_RESPONSES_TO_FLAG")
    cors_origins: str = Field("http://localhost:5173,http://localhost:3000", env="CORS_ORIGINS")

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def whatsapp_api_url(self) -> str:
        return f"https://graph.facebook.com/{self.whatsapp_api_version}/{self.whatsapp_phone_number_id}/messages"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
