import asyncio
import json
import logging
from typing import List, Dict, Any, Optional

from app.core.redis import redis_client

logger = logging.getLogger(__name__)

class EventBus:
    """Event bus with Redis pub/sub support and memory fallback.
    
    When Redis is available, messages are broadcast across all instances.
    When Redis is unavailable, it gracefully falls back to in-memory queues.
    """
    
    REDIS_CHANNEL = "o11y:events"

    def __init__(self):
        self._queues: List[asyncio.Queue] = []
        self._lock = asyncio.Lock()
        self._pubsub_task: Optional[asyncio.Task] = None
        self._use_redis = False

    async def initialize(self):
        """Initialize Redis connection and start pubsub listener if available."""
        if await redis_client.connect():
            self._use_redis = True
            self._pubsub_task = asyncio.create_task(self._redis_listener())
            logger.info("EventBus: Redis pub/sub enabled on channel '%s'", self.REDIS_CHANNEL)
        else:
            self._use_redis = False
            logger.info("EventBus: Redis unavailable, using in-memory fallback")

    async def shutdown(self):
        """Shutdown Redis connection and pubsub task."""
        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
            self._pubsub_task = None
        await redis_client.disconnect()
        self._use_redis = False

    async def _redis_listener(self):
        """Background task: listen to Redis pub/sub and forward to local queues."""
        pubsub = await redis_client.subscribe(self.REDIS_CHANNEL)
        if not pubsub:
            logger.warning("EventBus: Failed to subscribe to Redis, falling back to memory")
            self._use_redis = False
            return

        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        event = json.loads(message["data"])
                        await self._dispatch_local(event)
                    except json.JSONDecodeError:
                        logger.warning("EventBus: Invalid JSON from Redis: %s", message["data"])
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("EventBus: Redis listener error: %s", e)
        finally:
            await pubsub.unsubscribe(self.REDIS_CHANNEL)

    async def _dispatch_local(self, event: Dict[str, Any]):
        """Dispatch event to all local in-memory queues."""
        async with self._lock:
            dead = []
            for q in self._queues:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._queues.remove(q)

    async def subscribe(self) -> asyncio.Queue:
        """Subscribe to events. Returns an asyncio.Queue."""
        queue = asyncio.Queue()
        async with self._lock:
            self._queues.append(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue):
        """Unsubscribe from events."""
        async with self._lock:
            if queue in self._queues:
                self._queues.remove(queue)

    async def publish(self, event: Dict[str, Any]):
        """Publish an event. Broadcasts via Redis if available, always dispatches locally."""
        # Always dispatch to local queues (for same-instance subscribers)
        await self._dispatch_local(event)
        
        # If Redis is available, also broadcast to other instances
        if self._use_redis:
            success = await redis_client.publish(self.REDIS_CHANNEL, event)
            if not success:
                logger.warning("EventBus: Redis publish failed, event only dispatched locally")

event_bus = EventBus()
