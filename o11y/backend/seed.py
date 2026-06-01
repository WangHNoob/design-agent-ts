import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone

from app.core.database import AsyncSessionLocal
from app.models import Session, Trace, Span

async def seed():
    async with AsyncSessionLocal() as db:
        session = Session(
            id=str(uuid.uuid4()),
            name="Weather & Poem Session",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(session)

        trace = Trace(
            id=str(uuid.uuid4()),
            session_id=session.id,
            name="帮我查一下今天的天气并写首诗",
            status="ok",
            start_time=datetime.now(timezone.utc),
            end_time=datetime.now(timezone.utc) + timedelta(seconds=8),
            duration_ms=8200,
        )
        db.add(trace)

        base = datetime.now(timezone.utc)

        span1 = Span(
            id=str(uuid.uuid4()),
            trace_id=trace.id,
            session_id=session.id,
            parent_span_id=None,
            name="agent_main",
            span_type="AGENT_CHAIN",
            start_time=base,
            end_time=base + timedelta(seconds=8),
            duration_ms=8200,
            input_data=json.dumps({"query": "帮我查一下今天的天气并写首诗"}),
            output_data=json.dumps({"poem": "今天天气好，心情也很妙..."}),
            status="ok",
        )
        db.add(span1)

        span2 = Span(
            id=str(uuid.uuid4()),
            trace_id=trace.id,
            session_id=session.id,
            parent_span_id=span1.id,
            name="llm_thinking",
            span_type="LLM",
            start_time=base + timedelta(milliseconds=100),
            end_time=base + timedelta(seconds=3, milliseconds=200),
            duration_ms=3100,
            input_data=json.dumps([
                {"role": "system", "content": "你是一个助手..."},
                {"role": "user", "content": "帮我查一下今天的天气并写首诗"}
            ]),
            output_data=json.dumps({"thought": "用户想知道天气并写诗，我需要先调用天气工具。"}),
            metadata_json=json.dumps({"model": "gpt-4o", "prompt_tokens": 120, "completion_tokens": 50, "total_tokens": 170}),
            status="ok",
        )
        db.add(span2)

        span3 = Span(
            id=str(uuid.uuid4()),
            trace_id=trace.id,
            session_id=session.id,
            parent_span_id=span1.id,
            name="tool_weather_search",
            span_type="TOOL",
            start_time=base + timedelta(seconds=3, milliseconds=300),
            end_time=base + timedelta(seconds=4, milliseconds=500),
            duration_ms=1200,
            input_data=json.dumps({"keyword": "北京今天天气"}),
            output_data=json.dumps({"temperature": "25°C", "condition": "晴", "humidity": "40%"}),
            status="ok",
        )
        db.add(span3)

        span4 = Span(
            id=str(uuid.uuid4()),
            trace_id=trace.id,
            session_id=session.id,
            parent_span_id=span1.id,
            name="llm_poem_generation",
            span_type="LLM",
            start_time=base + timedelta(seconds=4, milliseconds=600),
            end_time=base + timedelta(seconds=7, milliseconds=500),
            duration_ms=2900,
            input_data=json.dumps([
                {"role": "system", "content": "你是一个诗人..."},
                {"role": "user", "content": "天气晴，25度，帮我写首诗"}
            ]),
            output_data=json.dumps({"poem": "晴空万里映朝阳，二十五度好风光..."}),
            metadata_json=json.dumps({"model": "gpt-4o", "prompt_tokens": 80, "completion_tokens": 60, "total_tokens": 140}),
            status="ok",
        )
        db.add(span4)

        await db.commit()
        print("Seed data inserted.")

if __name__ == "__main__":
    asyncio.run(seed())
