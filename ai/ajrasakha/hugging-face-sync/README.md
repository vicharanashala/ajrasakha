# HuggingFace Sync

Syncs golden Q&A data from MongoDB to HuggingFace Dataset daily via Google Cloud Run Jobs.

## Overview

This job:
1. Connects to MongoDB staging database
2. Fetches all closed questions with final answers
3. Creates a HuggingFace dataset with Q&A pairs
4. Pushes to `vicharanashala/ajrasakha-dataset-v1`

## Usage

### Local Development

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Test with dry run (no push to HuggingFace)
python sync.py --dry-run

# Test with limited data
python sync.py --dry-run --limit 10

# Full sync (pushes to HuggingFace)
python sync.py
```

### Cloud Run Job Setup

1. Build and push the container:
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/huggingface-sync
```

2. Create the Cloud Run Job:
```bash
gcloud run jobs create huggingface-sync \
  --image gcr.io/PROJECT_ID/huggingface-sync \
  --region=asia-south1 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=600s \
  --max-retries=3
```

3. Schedule as daily cron (using Cloud Scheduler):
```bash
gcloud scheduler jobs create http huggingface-sync-cron \
  --location=asia-south1 \
  --schedule="0 6 * * *" \
  --uri="https://asia-south1-run.googleapis.com/v2/projects/PROJECT_ID/locations/asia-south1/jobs/huggingface-sync:run" \
  --http-method=POST \
  --oauth-service-account-email=SA@PROJECT_ID.iam.gserviceaccount.com
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `MONGODB_DATABASE` | Database name (default: agriai) | No |
| `HUGGINGFACE_TOKEN` | HF access token with write access | Yes |
| `HF_DATASET_NAME` | Target dataset ID | No |

## Dataset Format

```python
{
    "question_id": str,      # MongoDB ObjectId as string
    "question": str,         # Question text
    "answer": str,           # Final answer text
    "author": str | None,    # Answer author name
    "sources": list,         # Source URLs/references
    "crop": str | None,      # Crop name
    "normalised_crop": str | None,
    "state": str | None,     # Indian state
    "season": str | None,
    "domain": str | None,
    "status": str,           # Question status
    "source": str | None,    # Question source (AJRASAKHA, WHATSAPP, etc.)
    "created_at": str | None # ISO timestamp
}
```

## Load Dataset

```python
from datasets import load_dataset

ds = load_dataset("vicharanashala/ajrasakha-dataset-v1")
print(ds["train"][0])
```

## Security

- Never commit `.env` with real credentials
- Use Secret Manager in production for sensitive values
- Ensure HF token has minimal required permissions