import json
import logging
import os
from pathlib import Path

import anthropic
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ffv_domains import FFV_DOMAINS  # Our own domain taxonomy from domain_angles.py

# basic logging setup so we can see what's happening in the logs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("ffv_api")

# Load environment variables
load_dotenv()
_parents = Path(__file__).resolve().parents
if len(_parents) > 2:
    load_dotenv(_parents[2] / ".env")

# Build Anthropic client
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")


def build_anthropic_client() -> anthropic.Anthropic:
    """Build and return an Anthropic client."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
    return anthropic.Anthropic(api_key=api_key)


def select_angles_for_domain(
    client: anthropic.Anthropic,
    domain: str,
    question: str,
    answer: str,
    max_angles: int = 6
) -> list[str]:
    """Select relevant angles for a domain from the question/answer."""
    angles = FFV_DOMAINS.get(domain, {})
    if not angles:
        log.warning("No angles found for domain: %s", domain)
        return []
    
    angle_list = list(angles.keys())
    angle_list_str = "\n".join(f"- {a}: {angles[a]}" for a in angle_list)
    
    prompt = f"""You are an agricultural expert helping farmers. Given a question and answer about agriculture, select the MOST RELEVANT angles (topics) from the list below that this content covers.

Question: {question}

Answer: {answer}

Available Angles:
{angle_list_str}

IMPORTANT RULES:
1. Select 1-{max_angles} angles that are MOST relevant to the content
2. Choose angles that have substantive information in the answer
3. Respond with ONLY a valid JSON array of angle names, nothing else
4. Example: ["Pest Identification", "Cultural Control", "Chemical Control"]

Select angles:"""

    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=512,
            system=(
                "You are an agricultural expert. "
                "Think carefully and follow all user instructions precisely."
            ),
            messages=[{"role": "user", "content": prompt}],
        )
        
        text = response.content[0].text.strip()
        
        # Try to parse JSON
        try:
            selected = json.loads(text)
            if isinstance(selected, list):
                # Validate against our angle list
                valid_angles = [a for a in selected if a in angles][:max_angles]
                log.info("Selected angles for '%s': %s", domain, valid_angles)
                return valid_angles
        except json.JSONDecodeError:
            log.warning("Failed to parse angle selection JSON: %s", text[:200])
        
        return []
    except Exception as e:
        log.error("Error selecting angles: %s", e)
        return []


def generate_ffv_for_angle(
    client: anthropic.Anthropic,
    question: str,
    answer: str,
    angle: str,
    angle_description: str
) -> dict | None:
    """Generate a farmer-friendly version for a specific angle."""
    prompt = f"""Given this agricultural expert Q&A:

Expert Question: {question}
Expert Answer: {answer}

Create a farmer-friendly Q&A for the angle: "{angle}"
Angle description: {angle_description}

Rules:
- Write ONLY in English
- Create a short, simple question a farmer would ask
- Answer in 2-3 short sentences maximum
- Use plain, simple language
- Focus only on the "{angle}" angle

Output ONLY valid JSON like this, nothing else:
{{"question": "short farmer question", "answer": "short answer"}}

Now generate:"""

    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2048,
            system=(
                "You are an agricultural expert. "
                "Always respond with valid JSON only. No markdown, no explanation."
            ),
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()

        # Extract JSON - handle markdown code blocks
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        # Try to parse JSON
        try:
            result = json.loads(text)
            if isinstance(result, dict) and "question" in result and "answer" in result:
                return result
        except json.JSONDecodeError:
            log.warning("Failed to parse FFV JSON: %s", text[:300])

        return None
    except Exception as e:
        log.error("Error generating FFV for angle '%s': %s", angle, e)
        return None


app = FastAPI(
    title="FFV Generator",
    description="Generates farmer-friendly versions (FFVs) of an expert question/answer pair, one per relevant angle.",
)


class FFVRequest(BaseModel):
    question: str = Field(..., description="The original question. Must not be empty.")
    answer: str = Field(..., description="The detailed expert answer. Must not be empty.")
    domains: list[str] | None = Field(
        None,
        description=(
            "Optional. List of 1-3 domain names (case-sensitive). "
            "Examples: ['Insect - Pest Management'], ['Irrigation and Water Management', 'Pest and Disease Management']. "
            "If omitted or blank, domains are classified automatically by the model. "
            "Max 3 domains. Angle distribution: 1 domain → 3-6 angles, 2 domains → 2-3 each, 3 domains → 1-2 each. "
            "An unknown domain name returns 400 with the list of valid domains."
        ),
    )

    


class FFVVersion(BaseModel):
    angle: str = Field(..., description="The angle this version covers, e.g. 'Irrigation Scheduling'.")
    question: str = Field(..., description="Farmer-friendly question for this angle.")
    answer: str = Field(..., description="Short farmer-friendly answer for this angle.")


class DomainFFVResult(BaseModel):
    domain: str = Field(..., description="The domain name.")
    versions: list[FFVVersion] = Field(
        ..., description="One entry per selected angle. Angles that fail to generate are omitted."
    )


class FFVResponse(BaseModel):
    results: list[DomainFFVResult] = Field(
        ..., description="FFV results per domain. 1 domain → 3-6 versions, 2 domains → 2-3 each, 3 domains → 1-2 each. Total max 6."
    )
    total_versions: int = Field(..., description="Total number of FFV versions generated.")


def _instrument_client(client) -> list[anthropic.APIError]:
    """Patch client.messages.create and return a list that collects API errors.

    - generate_ffvs.py catches every exception from the API and falls back
      (e.g. to the first domain), so errors never reach us. We record them here
      (and still re-raise, so the script's own fallback behaviour is unchanged)
      so the endpoint can tell a real failure from a normal result.
    """
    errors: list[anthropic.APIError] = []
    original_create = client.messages.create

    def create(*args, **kwargs):
        temp = kwargs.pop("temperature", None)
        if temp is not None:
            extra_body = dict(kwargs.get("extra_body") or {})
            extra_body["temperature"] = temp
            kwargs["extra_body"] = extra_body
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
        "Takes an expert question and answer (and optionally 1-3 domains), picks the relevant angles "
        "for each domain, and returns one farmer-friendly question/answer per angle. "
        "Angle distribution: 1 domain → 3-6 angles, 2 domains → 2-3 each, 3 domains → 1-2 each. "
        "Total max 6 FFVs."
    ),
    responses={
        400: {"description": "Empty question/answer, unknown domain, or more than 3 domains."},
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
        client = build_anthropic_client()
    except ValueError as exc:
        log.error("Anthropic client init failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Server is not configured with a valid ANTHROPIC_API_KEY.",
        )

    # Determine domains to process
    if request.domains and len(request.domains) > 0:
        # Validate provided domains
        validated_domains = []
        for d in request.domains:
            domain_name = d.strip()
            if not domain_name:
                continue
            if domain_name not in FFV_DOMAINS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown domain '{domain_name}'. Valid domains: {list(FFV_DOMAINS.keys())}",
                )
            validated_domains.append(domain_name)
        
        if len(validated_domains) > 3:
            raise HTTPException(
                status_code=400,
                detail="Maximum 3 domains allowed. Please provide 1-3 domains only.",
            )
        domains = validated_domains
    else:
        # No domains provided - auto-detect single domain
        # For now, use the first domain as default (can be improved with classification)
        domains = [list(FFV_DOMAINS.keys())[0]]
        log.warning("No domains provided, defaulting to: %s", domains[0])

    # Calculate angle limits per domain based on number of domains
    num_domains = len(domains)
    if num_domains == 1:
        min_angles, max_angles = 3, 6
    elif num_domains == 2:
        min_angles, max_angles = 2, 3
    else:  # 3 domains
        min_angles, max_angles = 1, 2

    log.info("Processing %d domain(s): %s (angles per domain: %d-%d)", num_domains, domains, min_angles, max_angles)

    # Generate FFVs for each domain
    all_results: list[DomainFFVResult] = []
    total_versions = 0

    for domain in domains:
        # Select angles for this domain
        angles = select_angles_for_domain(client, domain, question, answer, max_angles=max_angles)
        
        # Ensure we get at least min_angles if possible
        if len(angles) < min_angles:
            angles = select_angles_for_domain(client, domain, question, answer, max_angles=max(min_angles, max_angles))
        
        # Trim to max if still too many
        angles = angles[:max_angles]
        
        log.info("Domain '%s': selected %d angles: %s", domain, len(angles), angles)

        # Generate FFVs for each angle
        versions: list[FFVVersion] = []
        for angle in angles:
            angle_description = FFV_DOMAINS[domain][angle]
            ffv = generate_ffv_for_angle(client, question, answer, angle, angle_description)
            if ffv is not None:
                versions.append(FFVVersion(angle=angle, question=ffv["question"], answer=ffv["answer"]))
            else:
                log.warning("No FFV generated for angle '%s' (domain '%s')", angle, domain)

        if versions:
            all_results.append(DomainFFVResult(domain=domain, versions=versions))
            total_versions += len(versions)

    if total_versions == 0:
        raise HTTPException(
            status_code=502,
            detail="Could not generate any farmer-friendly versions for this question/answer.",
        )

    return FFVResponse(results=all_results, total_versions=total_versions)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003)
