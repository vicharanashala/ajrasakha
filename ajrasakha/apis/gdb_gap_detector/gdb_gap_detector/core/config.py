from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application Settings loaded from environment or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # MongoDB Settings
    mongo_uri: str = "mongodb+srv://lpulga167_db_user:UUXFvuymiWUfMeT3@hackathon.ibfnza4.mongodb.net/?appName=hackathon"
    feedback_db_name: str = "farmer_feedback"

    # Collections
    disclaimer_collection: str = "disclaimer_logs"
    gdb_entries_collection: str = "gdb_entries"
    flagged_entries_collection: str = "flagged_entries"
    gap_reports_collection: str = "gap_reports"

    # Pipeline Parameters
    period_days: int = 30
    noise_confidence_threshold: float = 0.15
    near_miss_low_threshold: float = 0.4
    near_miss_high_threshold: float = 0.7

    # Model & Clustering
    embedding_model_name: str = "all-MiniLM-L6-v2"
    min_cluster_size: int = 3

    # Operations & Server
    write_to_db: bool = False
    webhook_url: str | None = None
    host: str = "0.0.0.0"
    port: int = 8090


settings = Settings()
