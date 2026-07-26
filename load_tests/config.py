import os

# Base URL (Default to local backend, override with TARGET_URL env var if testing staging)
BASE_URL = os.getenv("TARGET_URL", "http://localhost:3000")

# API Endpoints (Inspected directly from backend controllers)
LOGIN_ENDPOINT = "/auth/login"
QUESTIONS_ENDPOINT = "/questions/all-questions"
UNASSIGNED_QUESTIONS_ENDPOINT = "/questions/unassigned"
SUBMIT_ANSWER_ENDPOINT = "/answers/submit"
ALLOCATE_QUESTION_ENDPOINT = "/questions/allocate"

# Simulated User Counts (Project 7 Specification)
NUM_EXPERT_USERS = 50
NUM_MODERATOR_USERS = 10

# SLA Threshold Targets (Project 7 Specification)
SLA_LOGIN_MS = 500          # Login response time <= 500ms
SLA_ANSWER_SUBMIT_MS = 1000 # Answer submission response time <= 1000ms
SLA_ALLOCATION_SEC = 30     # Question allocation within <= 30 seconds
