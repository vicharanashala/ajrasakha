import json
import logging
import sys
from pathlib import Path
from typing import Literal

import anthropic
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

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


class RelaxedJSONMiddleware(BaseHTTPMiddleware):
    """Tolerates unescaped control characters (e.g. raw newlines in multi-line string pastes in Swagger UI)."""

    async def dispatch(self, request: Request, call_next):
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            raw_body = await request.body()
            if raw_body:
                try:
                    json.loads(raw_body)
                except json.JSONDecodeError as exc:
                    if "control character" in str(exc).lower():
                        try:
                            obj = json.loads(raw_body.decode("utf-8", errors="replace"), strict=False)
                            cleaned_body = json.dumps(obj).encode("utf-8")
                            request._body = cleaned_body

                            async def receive():
                                return {"type": "http.request", "body": cleaned_body, "more_body": False}

                            request._receive = receive
                        except Exception:
                            pass
        return await call_next(request)


app.add_middleware(RelaxedJSONMiddleware)


class FFVRequest(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        json_schema_extra={
            "example": {
                "question": "How should I manage irrigation and fertilizers for my wheat crop?",
                "answer": "Wheat needs about 4-6 irrigations at crown root initiation, tillering, jointing, flowering and grain filling stages. Apply 120 kg Nitrogen and 60 kg Phosphorus per hectare.",
                "domains": [
                    "Irrigation and Water Management",
                    "Soil Health and Nutrient Management",
                ],
            }
        },
    )

    question: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="The original farming question. Must be between 1 and 5,000 characters.",
    )
    answer: str = Field(
        ...,
        min_length=1,
        max_length=50000,
        description="The detailed expert answer. Must be between 1 and 50,000 characters.",
    )
    domain: str | None = Field(
        default=None,
        description=(
            "Optional. Single exact domain name (case-sensitive), e.g. 'Irrigation and Water Management'. "
            "If both 'domain' and 'domains' are omitted, the domains are classified automatically."
        ),
    )
    domains: list[str] | None = Field(
        default=None,
        description=(
            "Optional. List of exact domain names, e.g. ['Irrigation and Water Management', 'Soil Health and Nutrient Management']. "
            "If both 'domain' and 'domains' are omitted, the domains are classified automatically."
        ),
    )


class FFVVersion(BaseModel):
    domain: str = Field(..., description="The agricultural domain this version covers.")
    angle: str = Field(..., description="The angle this version covers, e.g. 'Irrigation Scheduling'.")
    question: str = Field(..., description="Farmer-friendly question for this angle.")
    answer: str = Field(..., description="Short farmer-friendly answer for this angle.")


class FFVResponse(BaseModel):
    status: Literal["completed", "partial", "no_angles"] = Field(
        ...,
        description="Generation status: 'completed' (all selected angles generated), 'partial' (some versions generated), 'no_angles' (no versions generated).",
    )
    domain: str = Field(..., description="Primary domain (for backward compatibility).")
    domains: list[str] = Field(..., description="All relevant agricultural domains covered.")
    versions: list[FFVVersion] = Field(
        ..., description="One entry per successfully generated angle version."
    )
    failed_angles: list[str] = Field(
        default_factory=list,
        description="List of angles that failed during generation due to errors.",
    )


def _instrument_client(client):
    """Ensure client routes temperature to extra_body to satisfy anthropic SDK signature."""
    original_create = client.messages.create

    def create(*args, **kwargs):
        temp = kwargs.pop("temperature", None)
        if temp is not None:
            extra_body = dict(kwargs.get("extra_body") or {})
            extra_body["temperature"] = temp
            kwargs["extra_body"] = extra_body
        return original_create(*args, **kwargs)

    client.messages.create = create
    return client


def map_anthropic_error(exc: anthropic.APIError) -> HTTPException:
    """Map Anthropic exceptions directly to appropriate HTTP responses."""
    if isinstance(exc, anthropic.RateLimitError):
        return HTTPException(
            status_code=429,
            detail="The AI provider is temporarily rate-limited. Please retry shortly.",
            headers={"Retry-After": "5"},
        )
    if isinstance(exc, anthropic.APITimeoutError):
        return HTTPException(
            status_code=504,
            detail="The AI provider timed out. Please retry.",
        )
    if isinstance(exc, anthropic.AuthenticationError):
        return HTTPException(
            status_code=500,
            detail="The AI provider credentials are not configured correctly.",
        )

    msg = getattr(exc, "message", str(exc))
    if "credit balance is too low" in msg.lower():
        return HTTPException(
            status_code=502,
            detail="The AI provider account credit balance is too low. Please add credits in Anthropic Console Plans & Billing.",
        )

    return HTTPException(
        status_code=502,
        detail=f"The AI provider request failed: {type(exc).__name__}. {msg}",
    )


@app.post(
    "/generate-ffv",
    response_model=FFVResponse,
    summary="Generate farmer-friendly versions of a Q&A pair",
    description=(
        "Takes an expert question and answer (and optionally domain/domains), picks the relevant angles "
        "across those domains, and returns one farmer-friendly question/answer per angle (2-6 total)."
    ),
    responses={
        400: {"description": "Unknown domain name or more than 3 domains."},
        422: {"description": "Validation error: missing, empty, or oversized question/answer."},
        429: {"description": "Rate limited by the AI provider."},
        500: {"description": "Server is not configured with a valid ANTHROPIC_API_KEY."},
        502: {"description": "AI provider error."},
        504: {"description": "The AI provider timed out."},
    },
)
def generate_ffv(request: FFVRequest):
    question = request.question
    answer = request.answer

    try:
        client = generate_ffvs.build_anthropic_client()
        _instrument_client(client)
    except ValueError as exc:
        log.error("Anthropic client init failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Server is not configured with a valid ANTHROPIC_API_KEY.",
        )

    # Resolve domains from request (or prepare for auto-classification)
    resolved_domains: list[str] = []
    if request.domains:
        for d in request.domains:
            d_clean = d.strip()
            if d_clean:
                if d_clean not in generate_ffvs.DOMAIN_ANGLES:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown domain '{d_clean}'. Valid domains: {list(generate_ffvs.DOMAIN_ANGLES)}",
                    )
                if d_clean not in resolved_domains:
                    resolved_domains.append(d_clean)
        if len(resolved_domains) > 3:
            raise HTTPException(
                status_code=400,
                detail=f"At most 3 domains can be specified in 'domains'. Received {len(resolved_domains)}.",
            )
    elif request.domain and request.domain.strip():
        d_clean = request.domain.strip()
        if d_clean not in generate_ffvs.DOMAIN_ANGLES:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown domain '{d_clean}'. Valid domains: {list(generate_ffvs.DOMAIN_ANGLES)}",
            )
        resolved_domains = [d_clean]

    try:
        if not resolved_domains:
            # Auto-classify into 1 to 3 relevant agricultural domains
            resolved_domains = generate_ffvs.classify_domains(client, question, answer, max_domains=3)

        # Select relevant angles across all resolved domains subject to per-domain limits
        angle_items = generate_ffvs.select_angles_across_domains(
            client, resolved_domains, question, answer
        )

        versions: list[FFVVersion] = []
        failed_angles: list[str] = []

        for item in angle_items:
            d = item["domain"]
            angle = item["angle"]
            desc = item["angle_description"]
            try:
                ffv = generate_ffvs.generate_ffv_for_angle(client, question, answer, angle, desc)
                if ffv is not None:
                    versions.append(
                        FFVVersion(domain=d, angle=angle, question=ffv["question"], answer=ffv["answer"])
                    )
                else:
                    log.info("Angle '%s' skipped by model (not substantially covered)", angle)
            except (generate_ffvs.GenerationError, ValueError) as exc:
                log.warning("Generation failed for angle '%s': %s", angle, exc)
                failed_angles.append(angle)

    except generate_ffvs.ClassificationError as exc:
        log.warning("Domain classification failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Could not classify question/answer into a supported agricultural domain.",
        ) from exc
    except anthropic.APIError as exc:
        log.exception("Anthropic API request failed: %s", exc)
        raise map_anthropic_error(exc) from exc

    # Determine status: completed, partial, or no_angles
    if not versions:
        status: Literal["completed", "partial", "no_angles"] = "no_angles"
    elif len(versions) == len(angle_items):
        status = "completed"
    else:
        status = "partial"

    primary_domain = resolved_domains[0] if resolved_domains else "Unknown"
    return FFVResponse(
        status=status,
        domain=primary_domain,
        domains=resolved_domains,
        versions=versions,
        failed_angles=failed_angles,
    )


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
