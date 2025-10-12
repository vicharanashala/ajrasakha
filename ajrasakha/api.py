from urllib.parse import quote_plus
import httpx
from typing import List
from fastapi import FastAPI, File, Form, UploadFile, Request
from fastapi.responses import JSONResponse, StreamingResponse
from helpers import ollama_generate, tool_calling_forward
from models import (
    ChatCompletionRequest,
    ContextQuestionAnswerPair,
    ContextRequest,
    KnowledgeGraphNodes,
    QuestionAnswerResponse,
    SimilarityScoreRequest,
    ThinkingResponseChunk,
    ContentResponseChunk,
)
from llama_index.core import Settings
from constants import (
    API_KEY,
    SARVAM_URL,
)
import logging
import csv
from pathlib import Path
import csv
from pathlib import Path
from constants import (
    LLM_MODEL_FALL_BACK,
)
from numpy import dot
from numpy.linalg import norm
import requests, tempfile
from pydub import AudioSegment

logger = logging.getLogger("myapp")

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
LOG_FILE = Path("rag_eval_log.csv")

if not LOG_FILE.exists():
    with open(LOG_FILE, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["question", "answer", "context", "retrieval_time_sec"])

app = FastAPI(title="AjraSakha")


OLLAMA_API_URL = "http://100.100.108.13:11434/api/chat"
def get_audio_duration(path: str) -> float:
    audio = AudioSegment.from_file(path)
    return len(audio) / 1000.0  # duration in seconds


@app.post("/score")
def get_similarity_score(request: SimilarityScoreRequest):
    vec1 = Settings.embed_model.get_text_embedding(request.text1)
    vec2 = Settings.embed_model.get_text_embedding(request.text2)
    score = dot(vec1, vec2) / (norm(vec1) * norm(vec2))
    return {"similarity_score": score}


@app.post("/api/chat")
async def chat_completions(request: Request):
    raw_body = await request.body()
    # Decode to string for readability
    raw_text = raw_body.decode("utf-8")
    print("Raw input text:", raw_text)

    # If you still want to validate it using Pydantic later:
    data = await request.json()
    chat_request = ChatCompletionRequest(**data)
    print("Parsed messages:", chat_request.messages)


    return StreamingResponse(
        tool_calling_forward(chat_request),
        media_type="application/x-ndjson",
    )




@app.post("/v1/audio/transcriptions")
async def transcribe_audio(
    file: UploadFile = File(...),
):

    files = {"file": (file.filename, await file.read(), file.content_type)}

    headers = {"api-subscription-key": API_KEY}

    data = {
        "model": "saarika:v2.5",  # fixed or mapped from input
        "language_code": "unknown",
    }
    resp = requests.post(SARVAM_URL, headers=headers, data=data, files=files)
    sarvam_resp = resp.json()

    logger.info(resp.json())

    # Convert Sarvam → OpenAI response format
    return JSONResponse(
        content={
            "text": sarvam_resp.get("transcript", ""),
            "usage": {
                "type": "tokens",
                "input_tokens": 0,
                "input_token_details": {"text_tokens": 0, "audio_tokens": 0},
                "output_tokens": 0,
                "total_tokens": 0,
            },
        }
    )
