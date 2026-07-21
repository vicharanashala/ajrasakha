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

### 1.5 Grant your GitHub Actions SA permission to deploy the Job

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

The remaining 6 jobs to migrate:
- `moderatorQueueCron` → `moderator-queue` (every 1 min)
- `timeBoundReAllocateCron` → `time-bound-reallocate` (every 1 min)
- `questionStatus` → `question-status` (every 1 min)
- `agentStatusCleanupJob` → `agent-status-cleanup` (every 1 min)
- `dailyReport` → `daily-report` (twice daily)
- `notificationDelete` → `notification-delete` (daily 02:00)
