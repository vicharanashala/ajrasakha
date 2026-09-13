"""
GROQ Service — generates AI-powered weekly digest insights and handles
smart conversational responses for the WhatsApp simulator.
"""
import logging
import json
import re
from datetime import datetime
from typing import Optional
from groq import AsyncGroq
from app.config import settings

logger = logging.getLogger(__name__)


def _get_client() -> Optional[AsyncGroq]:
    """Return a GROQ client or None if not configured."""
    key = settings.groq_api_key
    if not key or key.startswith("your_"):
        return None
    return AsyncGroq(api_key=key)


# ── Weekly Digest ────────────────────────────────────────────────────────────

async def generate_weekly_digest_analysis(digest_data: dict) -> tuple[str, list[str]]:
    """
    Calls GROQ to generate human-readable insights and recommendations
    from the aggregated weekly feedback data.
    Returns: (analysis_text, recommendations_list)
    """
    client = _get_client()
    if not client:
        logger.warning("GROQ API key not configured — returning mock analysis")
        return _mock_analysis(digest_data)

    prompt = _build_digest_prompt(digest_data)

    try:
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an agricultural data analyst for ACE (Agricultural Chatbot for Experts). "
                        "You analyze farmer feedback data and produce actionable insights for the agri team. "
                        "Be concise, factual, and practical. Focus on what needs immediate attention. "
                        "IMPORTANT: Always respond ONLY with valid JSON. No markdown, no explanation outside JSON. "
                        'Use this exact format: {"analysis": "...", "recommendations": ["...", "...", "..."]}'
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=1024,
        )

        content = response.choices[0].message.content.strip()
        analysis, recommendations = _parse_groq_json(content)
        return analysis, recommendations

    except Exception as e:
        logger.error(f"GROQ API error during digest generation: {e}")
        return _mock_analysis(digest_data)


def _parse_groq_json(content: str) -> tuple[str, list[str]]:
    """
    Robustly parse a JSON response from GROQ.
    Handles markdown code fences and partial output.
    """
    # Strip markdown fences
    cleaned = re.sub(r"^```(?:json)?", "", content.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"```$", "", cleaned.strip()).strip()

    # Try direct parse
    try:
        parsed = json.loads(cleaned)
        analysis = parsed.get("analysis", "No analysis generated.")
        recommendations = parsed.get("recommendations", [])
        if isinstance(recommendations, list):
            recommendations = [str(r) for r in recommendations]
        return analysis, recommendations
    except json.JSONDecodeError:
        pass

    # Try extracting JSON object with regex
    match = re.search(r'\{.*\}', cleaned, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            analysis = parsed.get("analysis", content)
            recommendations = parsed.get("recommendations", [])
            return analysis, recommendations
        except json.JSONDecodeError:
            pass

    # Final fallback — return raw content as analysis
    logger.warning("Could not parse GROQ JSON response — using raw text as analysis")
    return content, []


# ── WhatsApp Conversational AI ───────────────────────────────────────────────

CONVERSATIONAL_SYSTEM_PROMPT = """You are Ajrasakha, a friendly and knowledgeable agricultural assistant chatbot for Indian farmers.
You help farmers with crop diseases, pest control, irrigation, soil health, fertilizers, weather, market prices, and government schemes.
You are warm, respectful, and use simple language. You speak to farmers as if you are a trusted local advisor.

Rules:
- For greetings (Hi, Hello, Namaste, etc.) — introduce yourself briefly and invite the farmer to ask a farming question.
- For off-topic questions — politely redirect to farming topics.
- For farming questions — give a concise, practical answer (2-4 sentences max) with dosages, timings, and regional advice where applicable.
- Always end farming answers with "Was this helpful? Reply 1 for Yes, 2 for No."
- Never make up scientific data. If unsure, say so and advise consulting a local agricultural officer.
- Keep responses short and easy to understand — farmers may be reading on basic phones."""


async def get_groq_chat_response(user_message: str, gdb_answer: Optional[str] = None) -> str:
    """
    Use GROQ to generate a smart, contextual response.
    If a GDB answer is provided, GROQ formats/enhances it.
    Otherwise GROQ handles the conversation directly.
    """
    client = _get_client()
    if not client:
        return None  # Caller should use GDB fallback

    # Build messages
    if gdb_answer:
        # GROQ refines the GDB answer
        user_content = (
            f"A farmer asked: \"{user_message}\"\n\n"
            f"The expert knowledge base has this answer:\n{gdb_answer}\n\n"
            "Please present this answer in a clear, friendly, practical way for an Indian farmer. "
            "Keep it concise. End with the helpfulness question."
        )
    else:
        user_content = user_message

    try:
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": CONVERSATIONAL_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
            max_tokens=400,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"GROQ chat response error: {e}")
        return None


def _is_greeting_or_off_topic(text: str) -> bool:
    """Detect greetings and non-farming messages."""
    text_lower = text.lower().strip()
    greeting_patterns = [
        "hi", "hello", "hey", "namaste", "namaskar", "helo", "hii",
        "good morning", "good afternoon", "good evening", "good night",
        "how are you", "who are you", "what are you", "what can you do",
        "help", "start", "begin", "menu", "kya hal", "theek ho",
        "jai hind", "jai kisan", "thanks", "thank you", "dhanyawad",
        "ok", "okay", "sure", "yes", "no",
    ]
    # Short messages (< 4 words) or known greetings
    word_count = len(text_lower.split())
    if word_count <= 3:
        for pattern in greeting_patterns:
            if pattern in text_lower:
                return True
    if word_count <= 2:
        return True  # Very short — treat as greeting/acknowledgement
    return False


# ── Digest helpers ───────────────────────────────────────────────────────────

def _build_digest_prompt(data: dict) -> str:
    """Build a structured prompt for GROQ from the weekly digest data."""
    lowest = data.get("lowest_rated_entries", [])[:5]
    domain_breakdown = data.get("domain_breakdown", [])
    domain_breakdown_sorted = sorted(domain_breakdown, key=lambda x: x.get("helpfulness_score", 100))

    lowest_str = "\n".join([
        f"  - {e.get('gdb_entry_id', 'unknown')} ({e.get('domain','?')}): "
        f"{e.get('helpfulness_score', 0):.1f}% helpful ({e.get('total_responses',0)} responses)"
        for e in lowest
    ])

    domain_str = "\n".join([
        f"  - {d.get('name','?')}: {d.get('helpfulness_score',0):.1f}% "
        f"({d.get('total_responses',0)} responses)"
        for d in domain_breakdown_sorted
    ])

    return f"""Analyze this week's farmer feedback data for the ACE agricultural knowledge base (GDB):

WEEK: {data.get('week_start', 'N/A')} to {data.get('week_end', 'N/A')}

OVERALL METRICS:
- Total feedback received: {data.get('total_feedback_count', 0)}
- Helpful responses: {data.get('total_helpful', 0)}
- Not helpful responses: {data.get('total_not_helpful', 0)}
- Overall helpfulness score: {data.get('overall_helpfulness_score', 0):.1f}%

WORST PERFORMING GDB ENTRIES:
{lowest_str if lowest_str else "  None below threshold"}

DOMAIN BREAKDOWN (sorted worst to best):
{domain_str if domain_str else "  No domain data"}

Provide a concise analysis and 3 actionable recommendations.

Respond ONLY with this JSON (no other text):
{{"analysis": "Your 2-3 sentence analysis here.", "recommendations": ["Rec 1", "Rec 2", "Rec 3"]}}"""


def _mock_analysis(data: dict) -> tuple[str, list[str]]:
    """Fallback analysis when GROQ is not configured or fails."""
    score = data.get("overall_helpfulness_score", 0)
    total = data.get("total_feedback_count", 0)
    lowest = data.get("lowest_rated_entries", [])

    analysis = (
        f"This week, {total} farmer feedback responses were captured with an overall helpfulness score of {score:.1f}%. "
        f"{'Performance is below the 60% target and requires immediate attention.' if score < 60 else 'Performance is above the 60% threshold.'} "
        f"{len(lowest)} GDB entries have been flagged for re-review based on consistent low ratings."
    )

    worst_domain = ""
    domains = data.get("domain_breakdown", [])
    if domains:
        worst = min(domains, key=lambda x: x.get("helpfulness_score", 100))
        worst_domain = worst.get("name", "Unknown")

    recommendations = [
        f"Priority: Review and rewrite the {len(lowest)} flagged GDB entries — these are the most impactful quality improvements.",
        f"{'Focus on ' + worst_domain + ' domain answers — they show the lowest helpfulness scores this week.' if worst_domain else 'Conduct a domain-level audit to identify systematic gaps in answer quality.'}",
        "Consider adding more region-specific details and practical dosage/timing information to answers that score below 50%.",
    ]

    return analysis, recommendations
