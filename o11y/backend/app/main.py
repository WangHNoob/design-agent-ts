import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.api.v1 import api_router
from app.api.v1.sessions import cleanup_expired_sessions


async def ttl_cleanup_loop():
    """Periodic background task to clean up expired sessions."""
    while True:
        await asyncio.sleep(3600)  # Every hour
        try:
            async with AsyncSessionLocal() as db:
                await cleanup_expired_sessions(db)
        except Exception as e:
            print(f"[TTL] Cleanup error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    task = asyncio.create_task(ttl_cleanup_loop())
    yield
    task.cancel()
    await engine.dispose()

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(api_router)
