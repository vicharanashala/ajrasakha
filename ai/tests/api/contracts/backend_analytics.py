import os

BACKEND_BASE_URL = os.getenv(
    "BACKEND_BASE_URL",
    "https://reviewer-backend-239934307367.asia-south2.run.app",
)

BACKEND_ANALYTICS_CASES = [
    {"service": "backend_analytics", "name": "analytics_dashboard_requires_auth_or_works", "method": "GET", "path": "/api/analytics/", "allowed_statuses": [200, 401, 403]},
    {"service": "backend_analytics", "name": "analytics_kpi_requires_auth_or_works", "method": "GET", "path": "/api/analytics/kpi", "allowed_statuses": [200, 401, 403]},
    {"service": "backend_analytics", "name": "analytics_top_crops_requires_auth_or_works", "method": "GET", "path": "/api/analytics/top-crops", "allowed_statuses": [200, 401, 403]},
]
