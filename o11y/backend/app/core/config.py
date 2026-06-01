from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "O11y Agent Observability"
    debug: bool = False
    database_url: str = "postgresql+asyncpg://o11y:o11y@localhost:5432/o11y"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3004",
        "http://127.0.0.1:3004",
    ]
    
    class Config:
        env_file = ".env"

settings = Settings()
