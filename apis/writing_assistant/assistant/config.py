import os

from dotenv import load_dotenv

load_dotenv()

# Public Gemini API (team-provided access to gemini-3.8-flash for this
# endpoint) - replaces the self-hosted MiniMax-M2.7 client this service
# used before. A directly-reachable public HTTPS endpoint, so (unlike the
# self-hosted model's 100.x tailnet address) no Tailscale/SOCKS proxy is
# needed to reach it.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")

# Carried over unchanged from the self-hosted MiniMax tuning (same
# numbers, same mechanism: the concurrency semaphore, these per-call
# timeout budgets, and hedged requests, all in llm_client.py) at the
# team's request, rather than stripped out - but these specific NUMBERS
# were empirically derived against MiniMax's own serving stack (vLLM
# GPU-contention behavior under load, 2-7s/call typical for that model).
# They are a reasonable starting point for Gemini, not evidence about
# Gemini's own latency or rate limits - re-validate against real Gemini
# traffic before trusting them the way the original tuning trusted them
# for MiniMax.
GEMINI_TIMEOUT_SECONDS = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "20"))
# classify_all_steps_coverage's own budget - one call now scores the
# WHOLE 10-step checklist at once (thinkingLevel "medium"), run up to 3x
# as a call-level majority vote (structural_validator._CHECKLIST_VOTES),
# so a full request costs ~2-3 of these calls, not the ~30 single-step
# calls this used to take.
GEMINI_COVERAGE_TIMEOUT_SECONDS = float(os.getenv("GEMINI_COVERAGE_TIMEOUT_SECONDS", "30"))
# generate_polish (whole-document, with a per-section fallback) and
# check_meaning_preserved_batch's own budget - each now runs once per
# request in the common case (not once per section).
GEMINI_POLISH_TIMEOUT_SECONDS = float(os.getenv("GEMINI_POLISH_TIMEOUT_SECONDS", "30"))

# Fixed seed on every call, to reduce (not guarantee-eliminate) run-to-run
# sampling variance on identical input - same reasoning as the MiniMax
# client this replaces (Writing Assistant Build Plan, Revision 14,
# ISS-04). The Gemini API accepts a "seed" field in generationConfig;
# not yet verified live that it has the same stabilizing effect MiniMax
# showed.
GEMINI_SEED = int(os.getenv("GEMINI_SEED", "0"))

# The chemical-name-drift guardrail layer connects directly to the same
# read-only staging cluster apis/chemical_detector uses, in-process - not
# over HTTP to that sibling service. Unaffected by the Gemini switch.
CHEMICAL_DB_URL = os.getenv("CHEMICAL_DB_URL")
CHEMICAL_DB_NAME = os.getenv("CHEMICAL_DB_NAME", "agriai")
CHEMICAL_COLLECTION_NAME = os.getenv("CHEMICAL_COLLECTION_NAME", "crop_master")

# A single request now makes only ~4-5 independent model calls (2-3
# whole-checklist coverage votes, 1 whole-document polish, 1 batched
# second opinion) in the common case - down from the ~30-50 single-step/
# per-section calls this used to take, now that each call scores/rewrites/
# checks everything it can in one shot (see classify_all_steps_coverage,
# generate_polish, and check_meaning_preserved_batch). The per-section
# polish fallback (_generate_polish_per_section, only used if the whole-
# document call fails or mismatches) can still make one call per
# section, so the pool and its cap stay in place for that path.
# Bounded by one process-wide pool (llm_client.run_concurrent) shared by
# every request, not per-request. Carried over from the MiniMax tuning
# (cap of 5) at the team's request - that number came from polling the
# self-hosted model's own vLLM /metrics under load (GPU compute
# contention); it has no equivalent evidence behind it for Gemini's
# public API, whose real constraint is a per-minute request quota, not
# GPU contention. Left in place as a conservative starting cap rather
# than removed outright - re-tune against Gemini's actual rate limit
# once this is live-tested.
GEMINI_MAX_CONCURRENT_CALLS = int(os.getenv("GEMINI_MAX_CONCURRENT_CALLS", "5"))
