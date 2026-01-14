from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv, find_dotenv
import uvicorn

from graph import app as graph_app

from langchain_openai_api_bridge.core.create_agent_dto import CreateAgentDto
from langchain_openai_api_bridge.fastapi.langchain_openai_api_bridge_fastapi import (
    LangchainOpenaiApiBridgeFastAPI,
)
from langchain_openai import ChatOpenAI

_ = load_dotenv(find_dotenv())


app = FastAPI(
    title="Langchain Completion API Bridge",
    version="1.0",
    description="OpenAI Chat Completion API exposing LangChain",
)

# CORS for Web UIs
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# This function is your "agent factory"
# It receives OpenAI request parameters via DTO
def create_agent(dto: CreateAgentDto):
    return graph_app

# Create bridge
bridge = LangchainOpenaiApiBridgeFastAPI(
    app=app,
    agent_factory_provider=create_agent,
)

bridge.bind_openai_chat_completion()




if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

