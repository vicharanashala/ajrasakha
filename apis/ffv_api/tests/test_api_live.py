"""Live tests: real questions from MongoDB (read-only) -> real Anthropic calls.

Run with:  pytest -m live -v     (skipped if MONGO_URI / ANTHROPIC_API_KEY are unset)
Each test makes several Anthropic calls, so the sample size is kept small.
"""
import os

import pytest
from fastapi.testclient import TestClient

import main
from main import generate_ffvs

pytestmark = pytest.mark.live

if not (os.getenv("MONGO_URI") and os.getenv("ANTHROPIC_API_KEY")):
    pytest.skip("MONGO_URI / ANTHROPIC_API_KEY not set", allow_module_level=True)

from pymongo import MongoClient  # noqa: E402

VALID = set(generate_ffvs.DOMAIN_ANGLES)
FILTER = {"answer": {"$exists": True, "$ne": None}, "details.domain.0": {"$exists": True}}


@pytest.fixture(scope="module")
def api():
    return TestClient(main.app)


@pytest.fixture(scope="module")
def questions():
    coll = MongoClient(os.environ["MONGO_URI"], serverSelectionTimeoutMS=15000)[os.getenv("MONGO_DB", "agriai")]["questions"]
    docs = list(coll.find(FILTER, {"question": 1, "answer": 1, "details.domain": 1}).limit(40))
    assert docs, "no usable documents in questions collection"
    return docs


def _doc_with_valid_domain(questions):
    for d in questions:
        dom = [x for x in d["details"]["domain"] if x in VALID]
        if dom:
            return d, dom[0]
    pytest.skip("no sampled document has a domain that is in DOMAIN_ANGLES")


def _check_ok(r, expected_domain=None):
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["domain"] in VALID
    if expected_domain:
        assert body["domain"] == expected_domain
    assert body["versions"], "no versions returned"
    assert len(body["versions"]) <= 6
    allowed = set(generate_ffvs.DOMAIN_ANGLES[body["domain"]])
    for v in body["versions"]:
        assert v["angle"] in allowed
        assert v["question"].strip() and v["answer"].strip()


def test_real_question_with_domain_from_db(api, questions):
    doc, domain = _doc_with_valid_domain(questions)
    r = api.post("/generate-ffv", json={"question": doc["question"], "answer": doc["answer"], "domain": domain})
    _check_ok(r, expected_domain=domain)


def test_real_question_without_domain_is_classified(api, questions):
    doc, _ = _doc_with_valid_domain(questions)
    r = api.post("/generate-ffv", json={"question": doc["question"], "answer": doc["answer"]})
    _check_ok(r)


def test_db_domain_values_not_in_taxonomy_are_rejected(api, questions):
    """Some DB docs carry domains (e.g. 'Weed Management') that aren't API domains."""
    bad = next((d for d in questions if d["details"]["domain"][0] not in VALID), None)
    if bad is None:
        pytest.skip("all sampled documents use valid domains")
    r = api.post(
        "/generate-ffv",
        json={"question": bad["question"], "answer": bad["answer"], "domain": bad["details"]["domain"][0]},
    )
    assert r.status_code == 400


def test_invalid_api_key_gives_502_not_wrong_domain(api, questions, monkeypatch):
    doc, _ = _doc_with_valid_domain(questions)
    monkeypatch.setattr(generate_ffvs, "ANTHROPIC_API_KEY", "sk-ant-invalid")
    r = api.post("/generate-ffv", json={"question": doc["question"], "answer": doc["answer"]})
    assert r.status_code == 502, r.text
