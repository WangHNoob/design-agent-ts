from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "O11y Agent Observability"
    debug: bool = True
    database_url: str = "sqlite+aiosqlite:///./o11y.db"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
    
    class Config:
        env_file = ".env"

settings = Settings()
