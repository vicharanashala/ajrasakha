import os

from dotenv import load_dotenv

load_dotenv()

# "local" (dev: read REFERENCE_DATA_DIR) or "gcs" (prod: read REFERENCE_GCS_BUCKET
# at REFERENCE_RELEASE_ID, pinned per Cloud Run revision). No default - an unset
# or unrecognized value must fail closed, never guess which source was meant.
REFERENCE_DATA_SOURCE = os.getenv("REFERENCE_DATA_SOURCE")

# local source
REFERENCE_DATA_DIR = os.getenv("REFERENCE_DATA_DIR")

# gcs source - the running service only ever reads its own pinned release id;
# it never polls a live "current" pointer (see Writing Assistant Build Plan,
# "Production release consistency"). Not wired up yet - no cloud resources
# have been created.
REFERENCE_GCS_BUCKET = os.getenv("REFERENCE_GCS_BUCKET")
REFERENCE_GCS_PREFIX = os.getenv("REFERENCE_GCS_PREFIX", "reference-data")
REFERENCE_RELEASE_ID = os.getenv("REFERENCE_RELEASE_ID")

# Same env var names already used elsewhere in this repo
# (ai/ajrasakha/agents/config.py, backend/src/config/ai.ts) - reused on
# purpose rather than inventing new ones.
MINIMAX_BASE_URL = os.getenv("MINIMAX_BASE_URL")
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
MINIMAX_MODEL = os.getenv("MINIMAX_MODEL", "MiniMaxAI/MiniMax-M2.7")
# 20s, not 90s, as of the switch to the self-hosted model (team
# requirement: response time under 20s). The 90s figure was tuned for
# MiniMax's public API (M3) - the only path ever live-tested before this
# - which routinely took 10-90+s per call. The self-hosted model
# (MiniMax-M2.7, reached directly over the tailnet) is a different
# serving stack entirely and was live-measured at 2-7s per call,
# typical, across 3 real test batches (a 10-case classify_step_coverage
# sample, median 3.4s/max 4.4s; two full end-to-end /polish-draft runs,
# ~33 sequential calls each, all but one well under 10s). One of those
# ~66 real calls did hang for the full old 90s budget before failing -
# a known behavior of reasoning models occasionally over-thinking a
# prompt, not a connectivity problem - so a 20s cap doesn't make that
# case succeed, it just fails it faster (consistent with this service's
# fail-closed design: a timeout is still reported as unavailable /
# needs_clarification, never a silent pass).
#
# This is a per-call budget, not the whole request's latency - each
# /polish-draft request makes several sequential calls (selection, one
# per expected step, the rewrite, the second opinion).
#
# If MINIMAX_BASE_URL is ever pointed back at the public API instead of
# the self-hosted tailnet model, override this back up (90 is the
# evidence-based value for that path) - this default is tuned for the
# self-hosted model specifically, not universal.
MINIMAX_TIMEOUT_SECONDS = float(os.getenv("MINIMAX_TIMEOUT_SECONDS", "20"))
# classify_and_select gets its own, longer budget - live-confirmed it
# needs more than the 20s default that was tuned off classify_step_coverage
# samples only. It compares one question against every known domain,
# Direct Topic and Crop Variant candidate at once (a heavier multi-
# candidate reasoning task than a single step's covered/partial/missing
# judgment), and real testing showed it can fail BOTH the initial attempt
# and the one retry at ~21s each, consistently, for the same input -
# not the rare one-off stall the retry was added for. 40s keeps this one
# call's own target generous without raising the shared 20s budget that
# the other, lighter, much-more-frequent calls (classify_step_coverage is
# called 3x per step) are tuned against.
MINIMAX_SELECTION_TIMEOUT_SECONDS = float(os.getenv("MINIMAX_SELECTION_TIMEOUT_SECONDS", "40"))
# classify_step_coverage also gets its own budget, slightly above the
# shared default rather than matching classify_and_select's - live-
# confirmed it can fail both the initial attempt and the retry at 20s on
# a larger-than-typical input (a longer draft and/or step list pushes it
# past 20s, observed failing at ~21s both times). Kept more conservative
# than MINIMAX_SELECTION_TIMEOUT_SECONDS on purpose: this call runs up to
# 3x per expected step (majority vote) - often 15-30 calls per request -
# so raising its budget multiplies total request latency far more than
# raising classify_and_select's (called once per request) did.
MINIMAX_COVERAGE_TIMEOUT_SECONDS = float(os.getenv("MINIMAX_COVERAGE_TIMEOUT_SECONDS", "30"))
# scripts/start.sh's tailscaled runs --tun=userspace-networking, which has
# no real network interface - a 100.x address is only reachable through
# the local SOCKS5 proxy it exposes, so llm_client.py routes through it
# automatically for the self-hosted model. That's wrong on a host that's
# ALREADY tailnet-joined at the OS level instead (a dev machine with the
# Tailscale client installed, confirmed live: the proxy assumption there
# makes a working direct connection fail with "connection refused" since
# nothing listens on the proxy port) - set this to "false" there to skip
# the proxy and connect directly. Mirrors backend/src/config/ai.ts's own
# USE_TAILNET_PROXY flag, which exists for the identical reason.
MINIMAX_USE_TAILNET_PROXY = os.getenv("MINIMAX_USE_TAILNET_PROXY", "true").lower() != "false"
# The self-hosted production model (per ai/ajrasakha/agents/config.py's
# get_minimax_chat_model) speaks the standard OpenAI-compatible path. The
# official public MiniMax API (used as a fallback for testing when the
# tailnet isn't reachable) uses its own path instead - confirmed by a live
# probe: /text/chatcompletion_v2, same request/response shape otherwise.
MINIMAX_CHAT_PATH = os.getenv("MINIMAX_CHAT_PATH", "/chat/completions")
# temperature=0.0 alone didn't fully stop the step-coverage classification
# from flipping between runs on identical input (Writing Assistant Build
# Plan, Revision 14, ISS-04, confirmed in a real test report) - a known
# property of some reasoning-model serving stacks even at zero temperature.
# Live-verified the API accepts this field without erroring; not promising
# this makes every call bit-for-bit reproducible, only that it removes one
# more independent source of sampling variance.
MINIMAX_SEED = int(os.getenv("MINIMAX_SEED", "0"))

# The chemical-name-drift guardrail layer connects directly to the same
# read-only staging cluster apis/chemical_detector uses, in-process - not
# over HTTP to that sibling service. Same env var names/defaults as
# apis/chemical_detector's own config, so the same connection string works
# for both. This makes this service's guardrail immune to that sibling
# service being removed, renamed, or rate-limited/cold-starting on its own
# free-tier Render plan (Writing Assistant Build Plan, Revision 14, ISS-03 -
# a real test report showed both failure modes live in production).
CHEMICAL_DB_URL = os.getenv("CHEMICAL_DB_URL")
CHEMICAL_DB_NAME = os.getenv("CHEMICAL_DB_NAME", "agriai")
CHEMICAL_COLLECTION_NAME = os.getenv("CHEMICAL_COLLECTION_NAME", "crop_master")
