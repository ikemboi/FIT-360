import os
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "your_secret_key")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "8dusp5dKuWvpyatnTRJaCZyHLyUW97cFg-ebif80pb8")
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:dennismagaki@localhost/fit360")
