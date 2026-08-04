from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
import json

from ajrasakha.agents.ajrasakha import graph

app = FastAPI()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/runs/stream")
async def runs_stream(request: Request):
    payload = await request.json()

    user_messages = (
        payload.get("input", {})
        .get("messages", [])
    )

    location = (
        payload.get("input", {})
        .get("location")
    )

    messages = []

    for msg in user_messages:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))

    state = {
        "messages": messages,
        "location": location,
        "plan": None,
        "sanitizer_audit": None,
        "golden_retrieval_audit": None,
    }

    async def event_generator():

        async for chunk in graph.astream(
            state,
            stream_mode="updates",
        ):

            yield (
                "event: values\n"
                f"data: {json.dumps(chunk, default=str)}\n\n"
            )

        yield (
            "event: end\n"
            'data: {"status":"success"}\n\n'
        )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=2026,
    )