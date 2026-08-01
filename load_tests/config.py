import os

# Base URL (Default to local backend, override with TARGET_URL env var if testing staging)
BASE_URL = os.getenv("TARGET_URL", "http://localhost:3000")

# API Endpoints (Inspected directly from backend routing-controllers with /api routePrefix)
HEALTH_ENDPOINT = "/api/health"
LOGIN_ENDPOINT = "/api/auth/login"
QUESTIONS_ENDPOINT = "/api/questions/all-questions"
UNASSIGNED_QUESTIONS_ENDPOINT = "/api/questions/unassigned"
SUBMIT_ANSWER_ENDPOINT = "/api/answers/submit"
ALLOCATE_QUESTION_ENDPOINT = "/api/questions/allocate"

# Microservices & Tailnet Endpoints (AI, LangGraph, MCP Servers)
LANGGRAPH_AI_ENDPOINT = "/api/ai/query"
MCP_MARKET_ENDPOINT = "/api/mcp/market"
MCP_WEATHER_ENDPOINT = "/api/mcp/weather"

# Simulated User Counts (Baseline 10 concurrent users up to 50 experts)
NUM_EXPERT_USERS = 10
NUM_MODERATOR_USERS = 5

# SLA Threshold Targets (Project 7 Specification)
SLA_HEALTH_MS = 200          # Health check <= 200ms
SLA_LOGIN_MS = 500          # Login response time <= 500ms
SLA_ANSWER_SUBMIT_MS = 1000 # Answer submission response time <= 1000ms
SLA_LANGGRAPH_AI_MS = 3000  # LangGraph AI query response time <= 3000ms
SLA_ALLOCATION_SEC = 30     # Question allocation within <= 30 seconds
