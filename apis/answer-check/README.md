# Answer Check API

Takes one answer and returns the result of the 13 quality checks: a name and a
status for each (PASS, FLAG or NOT_EVALUATED), with a reason, plus the counts.
No score or marks. A flag never blocks anything.

Checks that do not apply to an answer (for example dose uniformity, which
compares against other answers) are left out of the list.

## Run

```
pip install -r requirements.txt
cp .env.example .env      # then set MINIMAX_API_KEY (and MINIMAX_URL if needed)
python main.py            # listens on port 8012
```

Docker: `docker build -t answer-check . && docker run -p 8012:8012 --env-file .env answer-check`

## Endpoints

### `POST /check`

```json
{
  "question": "How to control stem borer in paddy?",
  "answer": "the answer text",
  "crop": "Paddy",
  "state": "Punjab",
  "sources": [{ "sourceName": "PoP", "source": "pop.pdf", "page": "12" }],
  "answerId": "optional",
  "version": "optional"
}
```

Only `question` and `answer` are required. `answerId` and `version` are sent
back in the result so the caller can tie it to a draft. Returns
`{ "job_id": "...", "status": "processing" }` straight away.

### `GET /check/{job_id}`

Poll every few seconds until `status` is `completed` or `failed`.
A check takes about 25-60 seconds (one answer took over 4 minutes while the
model server was retrying).

```json
{
  "jobId": "...",
  "status": "completed",
  "answerId": "optional",
  "version": "optional",
  "passed": 9,
  "flagged": 2,
  "notEvaluated": 0,
  "checks": [
    { "parameter": "banned_chemical", "category": "chemical", "status": "FLAG",
      "reason": "Benomyl. In the answer: “...”", "highlight": ["Benomyl"] },
    { "parameter": "source_present", "category": "source", "status": "FLAG",
      "reason": "No source attached to answer" }
  ],
  "checkedAt": "ISO date",
  "pipelineVersion": "v1.3"
}
```

- `status` of a check: `PASS`, `FLAG` (needs a look) or `NOT_EVALUATED` (could
  not run, for example the model failed; it is not a pass).
- `highlight` is the exact words in the answer to mark; only on a flag.
- `failed` job status means the job crashed; the result then has `error`.
- Unknown `job_id` gives 404. `GET /health` gives `{ "status": "ok" }`.
- Jobs are kept in memory and are lost on restart; resubmit if a poll returns 404.

`source_fidelity` and `local_name_mismatch` use the model and can change between
runs on the same answer.

## Tests

The tests are in the main pipeline repository (`tests/test_check_api.py`).
