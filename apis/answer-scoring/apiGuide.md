# API Guide

Base URL (local): `http://localhost:8010`

Async by design: a single answer needs 2-3 model calls, and the upstream
model API fails a meaningful fraction of individual calls, so one answer
can legitimately take anywhere from ~5 seconds to over a minute. Submit,
get a job id back immediately, poll for the result.

## POST /score

Submit an answer to be scored.

Request body:
```json
{
  "question": "how to grow paddy",
  "answer": "answer text...",
  "crop": "Paddy",
  "state": "Punjab",
  "sources": [
    {"sourceType": "pdf", "sourceName": "PAU Package of Practices", "source": "https://...pdf", "page": "12,13"}
  ]
}
```
`crop`, `state`, and `sources` are optional. `crop`/`state` being absent
weakens `restricted_chemical`, `contextuality`, and `local_name_mismatch`
specifically -- those checks work better with them.

Response (immediate):
```json
{"job_id": "...", "status": "processing"}
```

## GET /score/{job_id}

Poll this until `status` is `"completed"` or `"failed"`.

Response (completed):
```json
{
  "jobId": "...",
  "status": "completed",
  "systemScore": 11,
  "maxScore": 11,
  "percentage": 100.0,
  "needsHumanReview": false,
  "reviewReasons": [],
  "checks": [
    {"parameter": "banned_chemical", "category": "chemical", "result": "PASS", "mark": 1, "reason": "No banned chemical found"}
  ],
  "notApplicable": ["source_fidelity", "local_name_mismatch"],
  "notEvaluated": [],
  "checkedAt": "2026-..."
}
```

- `maxScore` varies per answer -- different question types have different
  applicable checks (a scheme question has no chemical checks at all), so
  `percentage` is the number that's comparable across answers, not the
  raw `systemScore`/`maxScore` count.
- `notApplicable`: checks that genuinely don't apply to this question
  type, excluded from the score entirely (neither helps nor hurts it).
- `notEvaluated`: checks that DO apply but got no verdict because a model
  call failed after every retry -- still given a mark for now, but this
  IS a gap, unlike `notApplicable`.
- `needsHumanReview`: true whenever any applicable check failed, or has
  no verdict at all. `reviewReasons` names exactly which and why, so a
  reviewer knows what to look at without reading the full breakdown.

## GET /health

Returns `{"status": "ok"}`.
