# Cloud Run Jobs Setup (reviewer system cron migration)

This document covers the one-time GCP setup and GitHub secrets required to deploy the Cloud Run Job `backup-db`, which replaces the in-process `node-cron` for `bootstrap/jobs/backupDB.ts`.

The same workflow file (`.github/workflows/cloudrun-jobs-deployment.yml`) is used to deploy additional Cloud Run Jobs as we migrate the other crons (moderator queue, time-bound reallocate, etc.).

---

## 1. One-time GCP setup (run locally, NOT from CI)

Replace `PROJECT_ID` and `BACKUP_BUCKET` with your real values before running.

```bash
export PROJECT_ID="your-gcp-project-id"           # e.g. vicharanashala-prod
export BACKUP_BUCKET="reviewer-db-backups"        # GCS bucket name
export REGION="asia-south2"                       # must match the existing service region
```

### 1.1 Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${PROJECT_ID}"
```

### 1.2 Create the GCS bucket (skip if it already exists)

```bash
gsutil mb -l "${REGION}" -b on "gs://${BACKUP_BUCKET}"
gsutil uniformbucketlevelaccess set on "gs://${BACKUP_BUCKET}"
```

### 1.3 Create the Job's runtime service account

```bash
gcloud iam service-accounts create backup-db-sa \
  --display-name="Cloud Run Job: backup-db" \
  --project="${PROJECT_ID}"

# Allow it to upload and check objects in the bucket.
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:backup-db-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:backup-db-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
```

### 1.4 Create the Scheduler trigger service account

```bash
gcloud iam service-accounts create backup-db-trigger-sa \
  --display-name="Cloud Scheduler trigger: backup-db" \
  --project="${PROJECT_ID}"
```

This SA only needs to be able to call the Job (no GCS access). The IAM binding
that grants it `roles/run.invoker` on the Job is added by the workflow itself.

It is reused across all reviewer-queue Jobs (`backup-db`, `gate-keeper-auditor-queue`, ...).

### 1.5 (per reviewer-queue job) Create the Job's runtime service account

Each reviewer-queue Job that does **not** need GCP API access only needs an
empty service account to exist (Cloud Run Jobs require *some* SA). This is the
principle of least privilege — it can't access anything by accident.

```bash
# Example for the gate-keeper / auditor queue Job.
# Repeat for each reviewer-queue Job you add to the workflow.
gcloud iam service-accounts create gate-keeper-auditor-queue-sa \
  --display-name="Cloud Run Job: gate-keeper-auditor-queue" \
  --project="${PROJECT_ID}"
# No IAM bindings — the SA has no permissions on purpose.

# Same pattern for the LGD sync Job (states/districts/blocks/villages) — it
# only talks to MongoDB Atlas and the external data.gov.in LGD API, so it
# needs no GCP API access either.
gcloud iam service-accounts create lgd-sync-sa \
  --display-name="Cloud Run Job: lgd-sync" \
  --project="${PROJECT_ID}"
# No IAM bindings — the SA has no permissions on purpose.

# Same pattern for the dataset-app sync Job — it only talks to the two
# MongoDB clusters (Review System + Dataset Application), so it needs no
# GCP API access either.
gcloud iam service-accounts create dataset-app-sync-sa \
  --display-name="Cloud Run Job: dataset-app-sync" \
  --project="${PROJECT_ID}"
# No IAM bindings — the SA has no permissions on purpose.
```

### 1.6 Grant your GitHub Actions SA permission to deploy the Job

Your existing `GCP_GH_SA_KEY` service account needs these roles:

```bash
GH_SA_EMAIL="$(gcloud iam service-accounts describe \
  "$(echo "${GCP_GH_SA_KEY}" | base64 -d | jq -r '.client_email')" \
  --project="${PROJECT_ID}" --format='value(email)')"

for ROLE in \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/cloudscheduler.admin \
  roles/storage.objectViewer
do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${GH_SA_EMAIL}" \
    --role="${ROLE}"
done
```

---

## 2. GitHub repository secrets

These need to be set in **Settings → Secrets and variables → Actions → Secrets**.

### Secrets that already exist (no action needed)
- `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
- `GCP_GH_SA_KEY`, `GCP_PROJECT_ID`
- `DB_URL`, `DB_NAME`
- `BACKUP_NOTIFICATION_EMAIL`, `EMAIL_USER`, `EMAIL_PASS`

### New secrets to add
| Secret | Example value | Notes |
|---|---|---|
| `GCP_BACKUP_BUCKET` | `reviewer-db-backups` | The GCS bucket from step 1.2 |
| `LGD_API_KEY` | `579b464db66ec...` | data.gov.in API key, same value as backend `.env` |
| `LGD_STATES_API_URL` | `https://api.data.gov.in/resource/a71e60f0-...` | Same value as backend `.env` |
| `LGD_DISTRICTS_API_URL` | `https://api.data.gov.in/resource/37231365-...` | Same value as backend `.env` |
| `LGD_SUBDISTRICTS_API_URL` | `https://api.data.gov.in/resource/6be51a29-...` | Same value as backend `.env`; used as the "blocks" source |
| `LGD_VILLAGES_API_URL` | `https://api.data.gov.in/resource/f17a1608-...` | Same value as backend `.env` |
| `DATA_APP_DB_URL` | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` | Dataset Application's MongoDB, same value as backend `.env` |
| `DATA_APP_DB_NAME` | `dataset_app` | Dataset Application's DB name, same value as backend `.env` |

### New variables to add (Settings → Secrets and variables → Actions → Variables)
| Variable | Default | Notes |
|---|---|---|
| `GCP_REGION` | `asia-south2` | Must match the existing `reviewer-backend` Cloud Run service region |

---

## 3. Run the workflow

1. Push the new files (`src/jobs/backup/run.ts`, modified `backupDB.ts` and `backup-cron.ts`, the workflow) to a branch and merge to `main`.
2. The backend image (`reviewer-api`) is rebuilt and pushed by the existing workflow (`build_and_deploy_reviewer.yml`) automatically when triggered — but for a quick smoke test, you can re-run the build manually first.
3. Go to **Actions → Cloud Run Jobs Deployment → Run workflow**, pick `backup-db`, hit run.
4. The workflow will:
   - Deploy / update the `backup-db` Cloud Run Job
   - Create / update the `backup-db-trigger` Cloud Scheduler job
   - Execute the Job once as a smoke test

---

## 4. Manual verification

```bash
# Check the job exists
gcloud run jobs describe backup-db --region="${REGION}" --project="${PROJECT_ID}"

# Trigger one run
gcloud run jobs execute backup-db --region="${REGION}" --project="${PROJECT_ID}" --wait

# Watch the logs
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=backup-db" \
  --project="${PROJECT_ID}" --limit=200

# Confirm ZIP exists in the bucket
gsutil ls "gs://${BACKUP_BUCKET}/" | grep "$(date +%d-%m-%Y)"
```

---

## 5. Next steps (other jobs)

When you're ready to migrate the remaining cron jobs, repeat the same pattern:

1. Add `backend/src/jobs/<job-name>/run.ts` — entrypoint that calls the existing service method.
2. Extend `.github/workflows/cloudrun-jobs-deployment.yml` with a `target_job` option and per-job blocks.
3. Decide if the job needs its own service account (most don't — they only touch Mongo via the existing connection string).

Jobs already migrated:
- `backupDB` → `backup-db` (0 8,19 * * *)  ✅
- `gateKeeperAuditorQueueCron` → `gate-keeper-auditor-queue` (* * * * *)  ✅

Remaining 6 jobs to migrate:
- `moderatorQueueCron` → `moderator-queue` (every 1 min)
- `timeBoundReAllocateCron` → `time-bound-reallocate` (every 1 min)
- `questionStatus` → `question-status` (every 1 min)
- `agentStatusCleanupJob` → `agent-status-cleanup` (every 1 min)
- `dailyReport` → `daily-report` (twice daily)
- `notificationDelete` → `notification-delete` (daily 02:00)

### New (non-migration) Cloud Run Jobs

Not every Cloud Run Job here replaces a legacy `node-cron` task — this one is
net-new and never existed as an in-process cron:

- `lgd-sync` (`0 3 * * 0`, Asia/Kolkata — weekly, Sunday 03:00 IST)  ✅
  Runs `backend/src/jobs/lgd-sync/run.ts`, which executes the existing
  standalone scripts `backend/scripts/create-lgd-{states,districts,blocks,villages}-collection.mjs`
  with `--apply`, strictly in that order, stopping immediately if any one of
  them exits non-zero (districts need states, blocks need districts, villages
  read the `blocks` collection those scripts write). No new sync logic — this
  job is only an orchestrator around the four existing scripts.
  Sized at 2Gi/2cpu with a 6h task-timeout since a full villages sync can
  involve thousands of data.gov.in API calls; adjust once real run times are
  known. Reuses `DB_URL`/`DB_NAME` and the existing `LGD_*` env vars — no new
  application code or env vars were introduced, only the new GitHub secrets
  listed in §2 so CI can pass them through to the deployed Job.

- `dataset-app-sync` (`0 4 * * *`, Asia/Kolkata — daily, 04:00 IST)  ✅
  Runs `backend/src/jobs/dataset-app-sync/run.ts`, which executes the
  existing standalone script `backend/scripts/sync-dataset-app.mjs --apply`.
  That script upserts the `users`, `questions`, and `answers` collections
  from the Review System's MongoDB (`DB_URL`/`DB_NAME`) into the Dataset
  Application's MongoDB (`DATA_APP_DB_URL`/`DATA_APP_DB_NAME`), matched on
  shared `_id`, so re-running it (including the workflow's smoke-test
  execution) is always safe. No new sync logic — this job is only an
  entrypoint around the existing script.
  Sized at 1Gi/1cpu with a 30-minute task-timeout; adjust once real
  collection sizes/run times are known. Scheduled for early morning so it
  runs ahead of daytime traffic and the 08:00 `backup-db` run.
