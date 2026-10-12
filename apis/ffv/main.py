import logging
import sys
from pathlib import Path

import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import anthropic
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# basic logging setup so we can see what's happening in the logs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("ffv_api")

# this service's own .env wins if present; the repo root .env is a fallback
# for anything not set here (load_dotenv never overwrites an already-set var,
# so loading the local one first gives it priority). This must run before
# importing generate_ffvs below, since that module reads ANTHROPIC_API_KEY
# into a constant once, at import time.
load_dotenv()
_parents = Path(__file__).resolve().parents
if len(_parents) > 2:
    load_dotenv(_parents[2] / ".env")

# generate_ffvs.py (ai/ajrasakha/ffv/scripts/) has no ai/__init__.py chain
# that would make it importable as a dotted package, so we bridge to it via
# sys.path plus a flat import instead. Two candidate locations: a local/dev
# monorepo checkout, or the Docker image (see Dockerfile, which copies the
# script into a sibling "ffv_scripts" folder next to this file).
_CANDIDATE_DIRS = [
    Path(__file__).resolve().parents[2] / "ai" / "ajrasakha" / "ffv" / "scripts",
    Path(__file__).resolve().parent / "ffv_scripts",
]
_scripts_dir = next((d for d in _CANDIDATE_DIRS if d.is_dir()), None)
if _scripts_dir is None:
    raise RuntimeError(
        f"generate_ffvs.py not found in any candidate location: {[str(d) for d in _CANDIDATE_DIRS]}"
    )
sys.path.insert(0, str(_scripts_dir))
import generate_ffvs  # noqa: E402 - must come after load_dotenv() above

app = FastAPI(title="FFV Generator")

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    """Create the Anthropic client once and reuse it (it pools connections)."""
    global _client
    if _client is None:
        try:
            _client = generate_ffvs.build_anthropic_client()
        except ValueError as exc:
            log.error("Anthropic client init failed: %s", exc)
            raise HTTPException(
                status_code=500,
                detail="Server is not configured with a valid ANTHROPIC_API_KEY.",
            )
    return _client


class FFVRequest(BaseModel):
    question: str
    answer: str


class FFVVersion(BaseModel):
    angle: str
    angle_description: str
    question: str
    answer: str


class FFVMetadata(BaseModel):
    request_id: str
    model: str
    selected_angles: list[str]  # angles the model chose for this Q&A
    skipped_angles: list[str]  # chosen, but no FFV produced (not covered / generation failed)
    latency_ms: int


class FFVResponse(BaseModel):
    domain: str
    domain_angles_available: int  # size of the angle list for this domain
    versions: list[FFVVersion]
    metadata: FFVMetadata


@app.post("/generate-ffv", response_model=FFVResponse)
def generate_ffv(request: FFVRequest):
    question = request.question.strip()
    answer = request.answer.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Field 'question' must not be empty.")
    if not answer:
        raise HTTPException(status_code=400, detail="Field 'answer' must not be empty.")

    client = _get_client()
    request_id = uuid.uuid4().hex[:12]
    started = time.perf_counter()

    # Parsing problems fall back inside classify_domain/select_angles (first
    # domain / no angles), but the API call itself can still raise (auth, rate
    # limit, network, bad model name), so those are mapped to HTTP errors here.
    try:
        domain = generate_ffvs.classify_domain(client, question, answer)
        angles = generate_ffvs.select_angles(client, domain, question, answer)

        def _one(angle: str) -> FFVVersion | None:
            description = generate_ffvs.DOMAIN_ANGLES[domain][angle]
            ffv = generate_ffvs.generate_ffv_for_angle(client, question, answer, angle, description)
            if ffv is None:
                return None
            return FFVVersion(
                angle=angle,
                angle_description=description,
                question=ffv["question"],
                answer=ffv["answer"],
            )

        # angles are independent: run them concurrently, keep selection order
        with ThreadPoolExecutor(max_workers=max(len(angles), 1)) as pool:
            versions = [v for v in pool.map(_one, angles) if v is not None]
    except anthropic.RateLimitError:
        raise HTTPException(status_code=429, detail="Upstream rate limit reached; retry shortly.")
    except anthropic.AuthenticationError:
        log.error("Anthropic rejected the API key")
        raise HTTPException(status_code=500, detail="Server is not configured with a valid ANTHROPIC_API_KEY.")
    except anthropic.APIError as exc:
        log.error("Anthropic API error: %s", exc)
        raise HTTPException(status_code=502, detail="Upstream LLM request failed.")

    produced = {v.angle for v in versions}
    return FFVResponse(
        domain=domain,
        domain_angles_available=len(generate_ffvs.DOMAIN_ANGLES[domain]),
        versions=versions,
        metadata=FFVMetadata(
            request_id=request_id,
            model=generate_ffvs.CLAUDE_MODEL,
            selected_angles=angles,
            skipped_angles=[a for a in angles if a not in produced],
            latency_ms=int((time.perf_counter() - started) * 1000),
        ),
    )


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)