from fastapi import APIRouter
from app.api.v1 import spans, traces, sessions, events, logs, runtime

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(spans.router, prefix="/spans", tags=["spans"])
api_router.include_router(traces.router, prefix="/traces", tags=["traces"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])
api_router.include_router(runtime.router, prefix="/runtime", tags=["runtime"])
api_router.include_router(events.router)
