import time
import httpx


def send_request(base_url: str, case: dict) -> dict:
    method = case["method"].upper()
    url = base_url.rstrip("/") + case["path"]
    start = time.time()

    try:
        response = httpx.request(
            method,
            url,
            json=case.get("json"),
            params=case.get("params"),
            headers=case.get("headers"),
            timeout=case.get("timeout", 20),
        )
        return {
            "service": case.get("service", ""),
            "name": case["name"],
            "method": method,
            "url": url,
            "status_code": response.status_code,
            "latency_seconds": round(time.time() - start, 2),
            "response_text": response.text[:500],
            "error": "",
        }
    except Exception as exc:
        return {
            "service": case.get("service", ""),
            "name": case["name"],
            "method": method,
            "url": url,
            "status_code": "",
            "latency_seconds": round(time.time() - start, 2),
            "response_text": "",
            "error": repr(exc),
        }