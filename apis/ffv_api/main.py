import logging
import sys
from pathlib import Path

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


class FFVRequest(BaseModel):
    question: str
    answer: str


class FFVVersion(BaseModel):
    angle: str
    question: str
    answer: str


class FFVResponse(BaseModel):
    domain: str
    versions: list[FFVVersion]


@app.post("/generate-ffv", response_model=FFVResponse)
def generate_ffv(request: FFVRequest):
    question = request.question.strip()
    answer = request.answer.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Field 'question' must not be empty.")
    if not answer:
        raise HTTPException(status_code=400, detail="Field 'answer' must not be empty.")

    try:
        client = generate_ffvs.build_anthropic_client()
    except ValueError as exc:
        log.error("Anthropic client init failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Server is not configured with a valid ANTHROPIC_API_KEY.",
        )

    # classify_domain always returns a key present in DOMAIN_ANGLES (falls back
    # to the first domain on any failure), and select_angles already filters its
    # result to angles valid for that domain and caps it to 6 - so neither of
    # these can raise, and the DOMAIN_ANGLES lookup below can't KeyError.
    domain = generate_ffvs.classify_domain(client, question, answer)
    angles = generate_ffvs.select_angles(client, domain, question, answer)

    versions: list[FFVVersion] = []
    for angle in angles:
        angle_description = generate_ffvs.DOMAIN_ANGLES[domain][angle]
        ffv = generate_ffvs.generate_ffv_for_angle(client, question, answer, angle, angle_description)
        if ffv is not None:
            versions.append(FFVVersion(angle=angle, question=ffv["question"], answer=ffv["answer"]))

    return FFVResponse(domain=domain, versions=versions)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
