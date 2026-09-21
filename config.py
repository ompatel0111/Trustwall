import os
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    # ── Flask ──────────────────────────────────────────────────────────────────
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    DEBUG = os.getenv("FLASK_DEBUG", "True") == "True"
    RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "True") == "True"

    # ── MongoDB ────────────────────────────────────────────────────────────────
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/proofly")

    # ── JWT ────────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "jwt-secret-change-in-production-proofly-key-32")
    JWT_REFRESH_SECRET_KEY = os.getenv("JWT_REFRESH_SECRET_KEY", "jwt-refresh-secret-change-in-production-proofly-key-32")

    # Access token expires in 15 minutes
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)

    # Refresh token expires in 7 days
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)

    # Store tokens in httpOnly cookies for security
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_SECURE = False          # Set to True in production (HTTPS only)
    JWT_COOKIE_CSRF_PROTECT = False    # Simplified for development
    JWT_COOKIE_SAMESITE = "Lax"

    # ── CORS ───────────────────────────────────────────────────────────────────
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5500")

    # ── Email (SMTP) — dev fallback only in Option A ───────────────────────────
    SMTP_HOST     = os.getenv("SMTP_HOST", "")
    SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER     = os.getenv("SMTP_USER", "")
    SMTP_PASS     = os.getenv("SMTP_PASS", "")
    SMTP_FROM     = os.getenv("SMTP_FROM", "noreply@proofly.com")
    EMAIL_DEV_MODE = True  # Option A: always dev mode
    APP_BASE_URL  = os.getenv("APP_BASE_URL", "http://localhost:5000")
