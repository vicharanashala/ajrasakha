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
from pydantic import BaseModel, Field
from typing import List, Optional
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from constants import EMBEDDING_MODEL

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

from markdownify import markdownify as md

def html_to_markdown(html_string: str) -> str:
    """
    Converts an HTML string to Markdown format.

    Args:
        html_string (str): Input HTML content.

    Returns:
        str: Converted Markdown text.
    """
    if not html_string or not isinstance(html_string, str):
        return ""

    # Convert using markdownify
    markdown_text = md(html_string, heading_style="ATX")
    return markdown_text.strip()



def extract_database_config(data: dict) -> dict:
    """
    Extracts which datasets ('golden', 'pop', 'llm') are enabled 
    based on the function names inside the 'tools' list of the given JSON.

    Args:
        data (dict): The input JSON parsed as a Python dictionary.

    Returns:
        dict: A dictionary in the format:
              {
                  "database_config": {
                      "golden_enabled": bool,
                      "pops_enabled": bool,
                      "llm_enabled": bool
                  }
              }
    """
    # Initialize all as False
    config = {
        "golden_enabled": False,
        "pops_enabled": False,
        "llm_enabled": True
    }

    # Safely get the list of tools
    tools = data.get("tools", [])

    # Check each function name for keywords
    for tool in tools:
        func = tool.get("function", {})
        name = func.get("name", "").lower()

        if "golden" in name:
            config["golden_enabled"] = True
        if "pop" in name:
            config["pops_enabled"] = True
        if "llm" in name:
            config["llm_enabled"] = True

    return config

def query_agrichat(question: str, device_id: str = "abcd", database_config: dict = None) -> dict:

    url = "https://agrichat.serveo.net/api/query"

    payload = {
        "question": question,
        "device_id": device_id
    }

    # Only include database_config if it’s explicitly provided
    if database_config:
        payload["database_config"] = database_config

    try:
        response = requests.post(url, json=payload, timeout=20)
        response.raise_for_status()  # Raise HTTPError for bad responses (4xx, 5xx)
        return response.json()       # Return parsed JSON response

    except requests.exceptions.RequestException as e:
        print(f"Error contacting AgriChat API: {e}")
        return {"error": str(e)}

    except ValueError:
        print("Error: Response is not valid JSON.")
        return {"error": "Invalid JSON response"}

def extract_response_details(response: dict) -> dict:
    # Safely navigate to messages
    messages = (
        response.get("session", {})
        .get("messages", [])
    )

    if not messages:
        return {
            "thinking": None,
            "answer": None,
            "sources": []
        }

    # Take the first (or most recent) message
    message = messages[0]

    thinking = message.get("thinking")
    answer = message.get("final_answer") or message.get("answer")

    # Extract simplified sources
    sources = []
    for item in message.get("research_data", []):
        sources.append({
            "source": item.get("source"),
            "content_preview": item.get("content_preview"),
            "metadata": item.get("metadata", {})
        })

    return {
        "thinking": thinking,
        "answer": answer,
        "sources": sources
    }

def sources_to_markdown_table(sources: list) -> str:
    if not sources:
        return "_No sources available._"

    # Define table headers
    headers = ["Source", "Content Preview", "Metadata"]
    md_table = f"| {' | '.join(headers)} |\n"
    md_table += f"| {' | '.join(['---'] * len(headers))} |\n"

    # Add rows
    for s in sources:
        source = s.get("source", "N/A")
        content = s.get("content_preview", "").replace("\n", " ").strip()
        metadata = s.get("metadata", {})

        # Convert metadata dict to key=value pairs
        meta_str = ", ".join(f"**{k}**: {v}" for k, v in metadata.items()) or "—"

        # Escape pipe characters to not break the table
        source = source.replace("|", "\\|")
        content = content.replace("|", "\\|")
        meta_str = meta_str.replace("|", "\\|")

        md_table += f"| {source} | {content} | {meta_str} |\n"

    return md_table.strip()


async def agrichat_resp(request: Request):
    raw_body = await request.body()
    # Decode to string for readability
    raw_text = raw_body.decode("utf-8")
    # print("Raw input text:", raw_text)

    # If you still want to validate it using Pydantic later:
    data = await request.json()
    question = data.get("messages", [{}])[-1].get("content", "")
    device_id = data.get("device_id", "abcd")

    # Extract database config
    db_config = extract_database_config(data)
    print("Extracted database config:", db_config)

    agrichat_response = query_agrichat(
        question=question,
        device_id=device_id,
        database_config=db_config.get("database_config", None)
    )

    details = extract_response_details(agrichat_response)

    yield ThinkingResponseChunk(details.get("thinking") or "thinking...")
    if details.get("answer"):
        yield ContentResponseChunk(html_to_markdown(details.get("answer")))
        yield ContentResponseChunk("\n"+ sources_to_markdown_table(details.get("sources")), final_chunk=True)
    else:
        yield ContentResponseChunk("Sorry, I couldn't retrieve an answer.", final_chunk=True)



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
    # print("Raw input text:", raw_text)

    # If you still want to validate it using Pydantic later:
    data = await request.json()


    # Extract database config
    db_config = extract_database_config(data)
    print("Extracted database config:", db_config)

    agrichat_response = query_agrichat(
        question=data.get("messages", [{}])[-1].get("content", ""),
        database_config=db_config.get("database_config", None)
    )



    # chat_request = ChatCompletionRequest(**data)
    # # print("Parsed messages:", chat_request.messages)


    return StreamingResponse(
        agrichat_resp(request=request),
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



# -------------------------------
# Load Hugging Face Embedding model once
# -------------------------------
# You can replace this model name with any HF embedding model
embedder = HuggingFaceEmbedding(model_name=EMBEDDING_MODEL)


# -------------------------------
# Request & Response Models
# -------------------------------

class EvaluateRequest(BaseModel):
    question_id: str = Field(..., description="Unique ID for the question")
    question_text: str = Field(..., description="The question being answered")
    answers: List[str] = Field(..., description="List of text answers for the question")
    params: Optional[dict] = Field(
        default=None,
        description="(Optional) Custom thresholds for convergence logic"
    )


class EvaluateResponse(BaseModel):
    question_id: str
    num_answers: int
    mean_similarity: float
    std_similarity: float
    recent_similarity: float
    collusion_score: float
    status: str
    message: str


# -------------------------------
# Core Evaluation Function
# -------------------------------

def evaluate_convergence(answers, params=None):
    if not answers or len(answers) < 2:
        return {
            "mean_similarity": 0.0,
            "std_similarity": 0.0,
            "recent_similarity": 0.0,
            "collusion_score": 0.0,
            "status": "⏳ CONTINUE",
            "message": "Not enough answers yet."
        }

    # Default thresholds
    cfg = {
        "T_recent": 0.82,
        "T_std": 0.1,
        "T_collusion": 0.97,
        "min_required": 5,
        "max_answers": 12,
        "k_recent": 4
    }
    if params:
        cfg.update(params)

    # Compute embeddings via LlamaIndex Hugging Face model
    embeddings = np.array([embedder.get_text_embedding(a) for a in answers])
    sims = cosine_similarity(embeddings)
    upper = np.triu_indices(len(answers), 1)
    mean_sim = float(np.mean(sims[upper]))
    std_sim = float(np.std(sims[upper]))

    # Recent answers (compare last k with others)
    k = min(cfg["k_recent"], len(answers) - 1)
    recent_embeddings = embeddings[-k:]
    recent_sims = cosine_similarity(recent_embeddings, embeddings[:-k])
    recent_similarity = float(np.mean(recent_sims))

    # Collusion score (max similarity excluding self-similarity)
    collusion_score = float(np.max(sims - np.eye(len(answers))))

    # Decision logic
    if (len(answers) >= cfg["min_required"] and
        recent_similarity >= cfg["T_recent"] and
        std_sim <= cfg["T_std"] and
        collusion_score < cfg["T_collusion"]):
        status = "CONVERGED"
        message = "Answers are semantically similar and stable."
    elif (collusion_score > cfg["T_collusion"] or
          len(answers) >= cfg["max_answers"]):
        status = "FLAGGED_FOR_REVIEW"
        message = "Suspicious similarity or no further improvement detected."
    else:
        status = "CONTINUE"
        message = "More responses required to reach convergence."

    return {
        "mean_similarity": mean_sim,
        "std_similarity": std_sim,
        "recent_similarity": recent_similarity,
        "collusion_score": collusion_score,
        "status": status,
        "message": message
    }


# -------------------------------
# API Endpoint
# -------------------------------

@app.post("/evaluate", response_model=EvaluateResponse)
def evaluate_answers(req: EvaluateRequest):
    """
    Evaluate whether a set of expert answers has converged.

    **Logic Summary:**
    - Uses Hugging Face embeddings via LlamaIndex to compute pairwise cosine similarities.
    - Checks for convergence (mean↑, std↓, stable recent answers).
    - Detects potential collusion (near-identical answers).
    - Flags or continues based on thresholds.

    **Returns:**  
    Convergence metrics and a status (`CONVERGED`, `CONTINUE`, `FLAGGED_FOR_REVIEW`).
    """
    result = evaluate_convergence(req.answers, req.params)
    return EvaluateResponse(
        question_id=req.question_id,
        num_answers=len(req.answers),
        **result
    )


class SingleEmbedRequest(BaseModel):
    text: str = Field(..., description="The text string to embed")

class SingleEmbedResponse(BaseModel):
    embedding: List[float] = Field(..., description="Embedding vector for the input text")


@app.post("/embed", response_model=SingleEmbedResponse)
def generate_single_embedding(req: SingleEmbedRequest):
    """
    Generate an embedding for a single text using the Hugging Face model via LlamaIndex.

    **Example Input:**
    ```json
    {
      "text": "What is sustainable farming?"
    }
    ```

    **Example Output:**
    ```json
    {
      "embedding": [0.0123, -0.0542, ...]
    }
    ```
    """
    embedding = embedder.get_text_embedding(req.text)
    return SingleEmbedResponse(embedding=embedding)
