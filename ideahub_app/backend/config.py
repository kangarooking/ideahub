"""Application configuration."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "sqlite+aiosqlite:///./ideahub.db"
    )
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    
    # OCR mode: "llm_vision" (recommended) or "paddleocr"
    OCR_MODE: str = os.getenv("OCR_MODE", "llm_vision")
    
    # MediaCrawler integration settings
    MEDIA_CRAWLER_DIR: str = os.getenv(
        "MEDIA_CRAWLER_DIR",
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "MediaCrawler")
    )
    MEDIA_CRAWLER_API_PORT: int = int(os.getenv("MEDIA_CRAWLER_API_PORT", "8080"))
    MEDIA_CRAWLER_API_URL: str = os.getenv(
        "MEDIA_CRAWLER_API_URL",
        f"http://127.0.0.1:{os.getenv('MEDIA_CRAWLER_API_PORT', '8080')}"
    )
    CRAWLER_DATA_DIR: str = os.getenv(
        "CRAWLER_DATA_DIR",
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "crawler_data")
    )

    def __init__(self) -> None:
        # Ensure upload directory exists
        upload_path = Path(self.UPLOAD_DIR)
        upload_path.mkdir(parents=True, exist_ok=True)


settings = Settings()
