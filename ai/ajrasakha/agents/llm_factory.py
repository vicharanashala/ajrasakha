import os

from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI


def get_chat_model(model: str):
    provider = os.getenv("LLM_PROVIDER", "anthropic").lower()

    if provider == "gemini":
        gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        api_key = os.getenv("GOOGLE_API_KEY")

        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not set")

        return ChatGoogleGenerativeAI(
            model=gemini_model,
            google_api_key=api_key,
            temperature=0,
        )

    return ChatAnthropic(model=model)