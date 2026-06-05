"""Standalone test to trace the sanitizer → synthesizer pipeline."""
import asyncio
import sys

from langchain_core.messages import HumanMessage

from ajrasakha.agents.ajrasakha import graph
from ajrasakha.agents.state import AjraSakhaState


async def run_test():
    print("\n" + "=" * 70)
    print("RUNNING: test_synth_debug.py")
    print("Watch for === SANITIZER DEBUG === and === SYNTHESIZER === prints")
    print("=" * 70 + "\n")

    initial_state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="Best practices for growing paddy in Punjab?"),
        ],
        "location": {"state": "Punjab", "city": "all"},
        "plan": {},
        "sanitizer_audit": None,
    }

    try:
        async for chunk in graph.astream(initial_state):
            pass  # debug prints already go to stdout, ignore chunks
    except Exception as e:
        print(f"\nERROR: {type(e).__name__}: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 70)
    print("DONE")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_test())