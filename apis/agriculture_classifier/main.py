"""Agriculture-question classifier: decides whether an incoming farmer
question is agriculture-related, using MiniMax LLM reasoning only (no
Mongo lookup, no classification dataset). Non-agriculture questions get a
pre-written disclaimer in the question's own language, looked up from a
CSV - never translated or generated at runtime.
"""

import logging

from fastapi import FastAPI, HTTPException

from classifier import disclaimers, llm_client
from classifier.models import ClassifyRequest, ClassifyResponse, LLMUnavailableError

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s")
log = logging.getLogger("agriculture_classifier")

app = FastAPI(title="Agriculture Question Classifier")


@app.post("/classify-question", response_model=ClassifyResponse)
def classify_question_endpoint(request: ClassifyRequest) -> ClassifyResponse:
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Field 'question' must not be empty.")

    try:
        is_agriculture = llm_client.classify_agriculture(request.question)
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=503, detail="Agriculture classification is currently unavailable.") from exc

    if is_agriculture:
        return ClassifyResponse(is_agriculture=True, disclaimer="NA")

    try:
        language = llm_client.detect_language(request.question)
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=503, detail="Language detection is currently unavailable.") from exc

    return ClassifyResponse(is_agriculture=False, disclaimer=disclaimers.get_disclaimer(language))


@app.get("/health")
def health() -> dict:
    disclaimers.get_disclaimer("English")
    return {"status": "ok"}


if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8005")))
