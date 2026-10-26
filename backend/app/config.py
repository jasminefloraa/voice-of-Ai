from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BASE_DIR / ".env")


class Settings:
    APP_NAME = "CreditNirvana Voice AI Studio"
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
    PORT = int(os.getenv("PORT", "8000"))
    SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
    SARVAM_BASE_URL = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai")
    DEMO_MODE = not bool(SARVAM_API_KEY)

    @property
    def sarvam_configured(self) -> bool:
        return bool(self.SARVAM_API_KEY)

    @property
    def sarvam_connection_status(self) -> str:
        if self.SARVAM_API_KEY:
            return "configured"
        return "demo"


settings = Settings()
