import json
import asyncio
from typing import Optional
from redis.asyncio import Redis
from app.core.config import settings

class RedisClient:
    def __init__(self):
        self._client: Optional[Redis] = None
        self._connected = False

    async def connect(self) -> bool:
        """Try to connect to Redis. Returns True if successful."""
        if not settings.redis_url:
            return False
        try:
            self._client = Redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_keepalive=True,
            )
            await self._client.ping()
            self._connected = True
            return True
        except Exception:
            self._client = None
            self._connected = False
            return False

    async def disconnect(self):
        """Close Redis connection."""
        if self._client:
            await self._client.close()
            self._client = None
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected and self._client is not None

    @property
    def client(self) -> Optional[Redis]:
        return self._client

    async def publish(self, channel: str, message: dict) -> bool:
        """Publish a message to a Redis channel."""
        if not self.is_connected or not self._client:
            return False
        try:
            await self._client.publish(channel, json.dumps(message))
            return True
        except Exception:
            return False

    async def subscribe(self, channel: str):
        """Subscribe to a Redis channel. Returns pubsub object."""
        if not self.is_connected or not self._client:
            return None
        try:
            pubsub = self._client.pubsub()
            await pubsub.subscribe(channel)
            return pubsub
        except Exception:
            return None

redis_client = RedisClient()
