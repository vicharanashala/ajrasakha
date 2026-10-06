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

**Deployed (staging):** `http://100.100.108.44:8011` -- external port
assigned during deployment, see apiGuide.md.

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

## Checking a deployment from its logs

On every start the service logs its configuration and makes one tiny real
model call. Look for these lines (the key itself is never logged):

```
MINIMAX_API_KEY: set                      <- or "NOT SET -- every model-based check will fail"
startup model check OK (attempt 1, 1.8s)  <- the server can reach the model with its key
startup model check FAILED 3/3            <- it cannot; the lines just above give the reason
```

Each scored answer logs `job <id> submitted ...` and
`job <id> finished in Ns: score=.. complete=.. notEvaluated=..` (sizes
only, never the answer text). `complete=False` / a non-empty
`notEvaluated` means model calls failed for that job; the first failure of
each call is logged as a WARNING with its error type. `LOG_LEVEL` (default
`INFO`) controls verbosity.

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
