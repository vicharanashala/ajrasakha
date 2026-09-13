"""
conftest.py — make `find_gap_candidates` importable from the parent dir
without requiring the project to be pip-installed.

The tool lives at `tools/gdb-gap-detector/find_gap_candidates.py`. The
tests live at `tools/gdb-gap-detector/tests/`. We add the parent
directory to sys.path so `import find_gap_candidates` resolves to the
real module.
"""

import os
import sys

# tools/gdb-gap-detector/tests/conftest.py → tools/gdb-gap-detector/
_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)