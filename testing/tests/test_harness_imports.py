"""
Smoke tests: every harness module parses and binds its top-level names.

These tests intentionally do NOT recursively import every dependency —
they parse-check each file with `py_compile`, which catches syntax
errors and indentation issues without executing module-level code
(so the `from locust import …` chain never runs).

Catches:
* Python syntax errors in any harness file.
* Bad indentation, missing colons, etc.

Does NOT catch:
* Circular import loops (those require running the full module graph).

Does not require a live backend, Mongo, or Locust runtime.
"""
from __future__ import annotations

import py_compile
import sys
from pathlib import Path
from typing import List

import pytest

ROOT = Path(__file__).resolve().parents[2]
LOCUST = ROOT / "testing" / "locust"


def _list_modules(subdir: str) -> List[Path]:
    d = LOCUST / subdir
    return sorted(p for p in d.glob("*.py") if p.name != "__init__.py")


def _syntax_check(path: Path) -> None:
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pyc", delete=True) as tmp:
        py_compile.compile(str(path), doraise=True, cfile=tmp.name)


@pytest.mark.parametrize("path", _list_modules("helpers"),
                         ids=lambda p: p.name)
def test_helpers_parse(path: Path) -> None:
    _syntax_check(path)


@pytest.mark.parametrize("path", _list_modules("tasks"),
                         ids=lambda p: p.name)
def test_tasks_parse(path: Path) -> None:
    _syntax_check(path)


@pytest.mark.parametrize("path", _list_modules("users"),
                         ids=lambda p: p.name)
def test_users_parse(path: Path) -> None:
    _syntax_check(path)


def test_locustfile_reviewer_parses() -> None:
    _syntax_check(LOCUST / "locustfile_reviewer.py")


def test_scenarios_parse() -> None:
    for p in (LOCUST / "scenarios").glob("*.py"):
        _syntax_check(p)


def test_all_harness_subdirs_present() -> None:
    for sub in ("helpers", "users", "tasks", "scenarios"):
        d = LOCUST / sub
        assert d.is_dir(), f"missing subdir: {d}"
        assert any(d.glob("*.py")), f"no .py files in {d}"


def test_no_stray_init_pyc_in_locust() -> None:
    """The harness MUST keep its empty `__init__.py` files — pytest
    collection relies on them NOT being there (otherwise pytest tries
    to import `testing.locust` as a real package and shadows the real
    Locust install)."""
    for sub in ("helpers", "users", "tasks"):
        init = LOCUST / sub / "__init__.py"
        assert init.exists(), f"missing harness marker: {init}"