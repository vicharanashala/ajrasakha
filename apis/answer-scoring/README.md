# answer-scoring

Scores a candidate's draft answer against 13 quality checks (banned/
restricted chemicals, source citation, answer structure, terminology,
etc.) and returns a score plus a flag for whether it needs human review.
This is the "System Checked Draft Answer Evaluation" step between
Question Collection and the Agri Professional's review.

See `apiGuide.md` for the endpoints and request/response shape.

## Local setup

```bash
cd apis/answer-scoring
pip install -r requirements.txt
cp .env.example .env   # then fill in MINIMAX_API_KEY
python main.py
```

Runs on `http://localhost:8010`. Interactive docs at `/docs`.

## Docker

```bash
docker build -t answer-scoring .
docker run -p 8010:8010 --env-file .env answer-scoring
```

## Tests

Run with the pipeline's origin project's test suite (`checker/api.py`
and `checker/scoring.py` are ported from there) -- offline, mocked LLM,
no real network/model calls, so it's fast and repeatable. If this
service's own test suite isn't included in this PR yet, ask for it.

## Known limitations (be honest with reviewers before this gates anything)

- Roughly 6 of the 13 checks are solidly verified (banned/restricted
  chemical, source presence, page number, officer name). The rest --
  answer structure, sequence, source fidelity, local-name mismatch,
  private product name, and whether "which variety?" needs a named
  answer -- have known false-positive/false-negative rates or are
  unproven/disabled. `needsHumanReview` is deliberately broad because of
  this: it fires on any failed or unresolved check, not just the
  unreliable ones.
- `uniformity_of_dose` will always show as not-applicable here, by
  design: it compares a dose across other answers in the same batch, and
  this service always scores one answer at a time.
- This score should not auto-gate a hire/certification decision on its
  own. A human should review every answer regardless of the score,
  ideally enforced as a real state check (e.g. a `reviewedByHuman` field)
  wherever the actual hire decision is made, not assumed as a process.
