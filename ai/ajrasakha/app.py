from typing import TypedDict, Optional, List
import uvicorn
from fastapi import HTTPException, FastAPI
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_qwq import ChatQwen
from starlette.responses import StreamingResponse
from api import ChatCompletionRequest
from api.streaming_utils import agent_response


class AgentState(TypedDict):
    messages: List[BaseMessage]
    latitude: Optional[float]
    longitude: Optional[float]


llm = ChatQwen(
    model="Qwen/Qwen3-30B-A3B",
    temperature=0,
    streaming=True,
    api_key="fdsfa",
    base_url="http://100.100.108.100:8081/v1",
)


async def chatbot_node(state: AgentState, config: RunnableConfig):
    messages = state["messages"]
    user_msg = messages[-1].content

    await adispatch_custom_event(
        name='ajrasakha',
        data={"info": "custom event data"},
        config=config,
    )
    response = await llm.ainvoke(messages)

    return {
        "messages": messages + [response]
    }


builder = StateGraph(AgentState)
builder.add_node("chatbot", chatbot_node)
builder.set_entry_point("chatbot")
builder.set_finish_point("chatbot")

graph = builder.compile()


app = FastAPI()

@app.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    if request.messages and request.stream:
        return StreamingResponse(
            agent_response(
                messages=request.messages,
                graph=graph,
            ), media_type="application/x-ndjson"
        )
    else:
        return HTTPException(status_code=400, detail="No messages provided")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

