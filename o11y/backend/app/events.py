import asyncio
import json
from typing import List, Dict, Any

class EventBus:
    def __init__(self):
        self._queues: List[asyncio.Queue] = []
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        async with self._lock:
            self._queues.append(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue):
        async with self._lock:
            if queue in self._queues:
                self._queues.remove(queue)

    async def publish(self, event: Dict[str, Any]):
        async with self._lock:
            dead = []
            for q in self._queues:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._queues.remove(q)

event_bus = EventBus()
