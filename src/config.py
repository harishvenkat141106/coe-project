import os

def load_dotenv():
    """Simple env parser without requiring external python-dotenv dependency."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'").strip('"')
                    if key and not os.environ.get(key):
                        os.environ[key] = val

load_dotenv()

class Config:
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    KAGGLE_USERNAME: str = os.getenv("KAGGLE_USERNAME", "")
    KAGGLE_KEY: str = os.getenv("KAGGLE_KEY", "")
    
    AUTO_MERGE_THRESHOLD: float = float(os.getenv("AUTO_MERGE_THRESHOLD", "0.85"))
    REVIEW_THRESHOLD: float = float(os.getenv("REVIEW_THRESHOLD", "0.50"))
    DEFAULT_K_ANONYMITY_THRESHOLD: int = int(os.getenv("DEFAULT_K_ANONYMITY_THRESHOLD", "10"))
    
    @classmethod
    def get_genai_status(cls):
        if cls.GEMINI_API_KEY:
            return "ENABLED (Gemini Pro API)"
        elif cls.OPENAI_API_KEY:
            return "ENABLED (OpenAI API)"
        else:
            return "SIMULATED (Built-in Pure Python GenAI Heuristic Engine)"
