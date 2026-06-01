import asyncio
import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.events import event_bus

router = APIRouter(prefix="/events", tags=["events"])

async def event_generator(request: Request):
    queue = await event_bus.subscribe()
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                data = json.dumps(event, ensure_ascii=False, default=str)
                yield f"event: {event.get('type', 'update')}\ndata: {data}\n\n"
            except asyncio.TimeoutError:
                yield ":keepalive\n\n"
    finally:
        await event_bus.unsubscribe(queue)

@router.get("")
async def events(request: Request):
    return StreamingResponse(
        event_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
