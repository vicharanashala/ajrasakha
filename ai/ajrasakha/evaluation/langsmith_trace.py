import os


def build_langsmith_trace_url(result: dict) -> dict:
    trace_id = result.get("trace_id") or result.get("run_id") or ""
    project = os.getenv("LANGCHAIN_PROJECT", "")

    if not trace_id:
        return {
            "trace_url": "",
            "trace_available": False,
        }

    return {
        "trace_url": f"https://smith.langchain.com/o/default/projects/p/{project}/r/{trace_id}",
        "trace_available": True,
    }