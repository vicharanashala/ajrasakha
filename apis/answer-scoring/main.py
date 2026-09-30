"""Entrypoint for the answer-scoring API.

Unlike this repo's other apis/ services (a single file), this one keeps
its implementation split by concern inside checker/ (scoring, chemical
checks, LLM-based checks, source checks, etc.) because it's ported from
an origin project with its own test suite structured the same way --
easier to review and maintain split up than merged into one file.

checker/ is added directly onto sys.path (not imported as a Python
package) so every file inside it keeps the exact same flat imports it
already has and is tested with (e.g. `from run_checker import ...`, not
`from .run_checker import ...`) -- zero import-statement changes needed
in any file copied over from the origin project.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "checker"))

import uvicorn  # noqa: E402
from api import app  # noqa: E402,F401 -- re-exported so `main:app` also works

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8010)
