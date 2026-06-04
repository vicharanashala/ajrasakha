import os

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "https://desk.vicharanashala.ai/api")

BACKEND_ANALYTICS_CASES = [
    {"service": "backend_analytics", "name": "analytics_dashboard_requires_auth_or_works", "method": "GET", "path": "/analytics/", "allowed_statuses": [200, 401, 403]},
    {"service": "backend_analytics", "name": "analytics_kpi_requires_auth_or_works", "method": "GET", "path": "/analytics/kpi", "allowed_statuses": [200, 401, 403]},
    {"service": "backend_analytics", "name": "analytics_top_crops_requires_auth_or_works", "method": "GET", "path": "/analytics/top-crops", "allowed_statuses": [200, 401, 403]},
]