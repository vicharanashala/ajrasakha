import logging
import sys
from pathlib import Path

import anthropic
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

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
# sys.path plus a flat import instead. Candidate locations:
# - local/dev monorepo checkout: <repo>/ai/ajrasakha/ffv/scripts/
# - Docker image: <app_dir>/ffv_scripts/ (see Dockerfile, which copies the
#   script into "ffv_scripts" folder next to main.py)
_parents = Path(__file__).resolve().parents
_CANDIDATE_DIRS = [
    # Only add repo-root-relative path if we're actually in a deep enough structure
    *([_parents[2] / "ai" / "ajrasakha" / "ffv" / "scripts"] if len(_parents) > 2 else []),
    # Always check the local "ffv_scripts" folder (works for Docker and local runs)
    Path(__file__).resolve().parent / "ffv_scripts",
]
_scripts_dir = next((d for d in _CANDIDATE_DIRS if d.is_dir()), None)
if _scripts_dir is None:
    raise RuntimeError(
        f"generate_ffvs.py not found in any candidate location: {[str(d) for d in _CANDIDATE_DIRS]}"
    )
sys.path.insert(0, str(_scripts_dir))
import generate_ffvs  # noqa: E402 - must come after load_dotenv() above

app = FastAPI(
    title="FFV Generator",
    description="Generates farmer-friendly versions (FFVs) of an expert question/answer pair, one per relevant angle.",
)


class FFVRequest(BaseModel):
    question: str = Field(..., description="The original question. Must not be empty.")
    answer: str = Field(..., description="The detailed expert answer. Must not be empty.")
    domain: str | None = Field(
        None,
        description=(
            "Optional. Exact domain name (case-sensitive), e.g. 'Irrigation and Water Management'. "
            "If omitted or blank, the domain is classified automatically by the model. "
            "An unknown name returns 400 with the list of valid domains."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "question": "How often should I irrigate wheat?",
                "answer": "Wheat needs about 4-6 irrigations, at crown root initiation, tillering, jointing, flowering and grain filling stages.",
                "domain": "Irrigation and Water Management",
            }
        }
    }


class FFVVersion(BaseModel):
    angle: str = Field(..., description="The angle this version covers, e.g. 'Irrigation Scheduling'.")
    question: str = Field(..., description="Farmer-friendly question for this angle.")
    answer: str = Field(..., description="Short farmer-friendly answer for this angle.")


class FFVResponse(BaseModel):
    domain: str = Field(..., description="The domain used: the one supplied in the request, or the auto-detected one.")
    versions: list[FFVVersion] = Field(
        ..., description="One entry per selected angle (up to 6). Angles that fail to generate are omitted."
    )


def _instrument_client(client) -> list[anthropic.APIError]:
    """Patch client.messages.create and return a list that collects API errors.

    - generate_ffvs.py passes temperature= to messages.create, which the
      installed anthropic SDK / model rejects. We can't change that script from
      here, so strip the argument on this client instead.
    - generate_ffvs.py catches every exception from the API and falls back
      (e.g. to the first domain), so errors never reach us. We record them here
      (and still re-raise, so the script's own fallback behaviour is unchanged)
      so the endpoint can tell a real failure from a normal result.
    """
    errors: list[anthropic.APIError] = []
    original_create = client.messages.create

    def create(*args, **kwargs):
        kwargs.pop("temperature", None)
        try:
            return original_create(*args, **kwargs)
        except anthropic.APIError as exc:
            log.error("Anthropic API call failed: %s: %s", type(exc).__name__, exc)
            errors.append(exc)
            raise

    client.messages.create = create
    return errors


def _raise_upstream_error(errors: list[anthropic.APIError]) -> None:
    """Turn the first recorded Anthropic error into an HTTP error."""
    first = errors[0]
    if isinstance(first, anthropic.RateLimitError):
        raise HTTPException(status_code=429, detail="Rate limited by the AI provider. Please retry shortly.")
    if isinstance(first, anthropic.APITimeoutError):
        raise HTTPException(status_code=504, detail="The AI provider timed out. Please retry.")
    if isinstance(first, anthropic.AuthenticationError):
        raise HTTPException(status_code=502, detail="AI provider rejected the server's credentials.")
    raise HTTPException(status_code=502, detail=f"AI provider error: {type(first).__name__}.")


@app.post(
    "/generate-ffv",
    response_model=FFVResponse,
    summary="Generate farmer-friendly versions of a Q&A pair",
    description=(
        "Takes an expert question and answer (and optionally a domain), picks the relevant angles "
        "for that domain, and returns one farmer-friendly question/answer per angle."
    ),
    responses={
        400: {"description": "Empty question/answer, or an unknown domain name."},
        429: {"description": "Rate limited by the AI provider."},
        500: {"description": "Server is not configured with a valid ANTHROPIC_API_KEY."},
        502: {"description": "AI provider error, or no versions could be generated."},
        504: {"description": "The AI provider timed out."},
    },
)
def generate_ffv(request: FFVRequest):
    question = request.question.strip()
    answer = request.answer.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Field 'question' must not be empty.")
    if not answer:
        raise HTTPException(status_code=400, detail="Field 'answer' must not be empty.")

    try:
        client = generate_ffvs.build_anthropic_client()
        api_errors = _instrument_client(client)
    except ValueError as exc:
        log.error("Anthropic client init failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Server is not configured with a valid ANTHROPIC_API_KEY.",
        )

    # classify_domain always returns a key present in DOMAIN_ANGLES (falling back
    # to the first domain only when the model's JSON can't be parsed), and
    # select_angles filters its result to valid angles and caps it to 6, so the
    # DOMAIN_ANGLES lookup below can't KeyError. Both let API errors propagate
    # though, so map those to HTTP errors here.
    try:
        if request.domain and request.domain.strip():
            domain = request.domain.strip()
            if domain not in generate_ffvs.DOMAIN_ANGLES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown domain '{domain}'. Valid domains: {list(generate_ffvs.DOMAIN_ANGLES)}",
                )
        else:
            domain = generate_ffvs.classify_domain(client, question, answer)
        angles = generate_ffvs.select_angles(client, domain, question, answer)
    except anthropic.APIError:
        _raise_upstream_error(api_errors)

    versions: list[FFVVersion] = []
    for angle in angles:
        angle_description = generate_ffvs.DOMAIN_ANGLES[domain][angle]
        ffv = generate_ffvs.generate_ffv_for_angle(client, question, answer, angle, angle_description)
        if ffv is not None:
            versions.append(FFVVersion(angle=angle, question=ffv["question"], answer=ffv["answer"]))
        else:
            log.warning("No FFV generated for angle '%s' (domain '%s')", angle, domain)

    if not versions:
        if api_errors:
            _raise_upstream_error(api_errors)
        raise HTTPException(
            status_code=502,
            detail="Could not generate any farmer-friendly versions for this question/answer.",
        )

    return FFVResponse(domain=domain, versions=versions)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
