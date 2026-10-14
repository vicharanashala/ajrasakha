# Google Cloud Run Deployment Setup Guide

This guide explains how to set up the infrastructure and secrets required for deploying to Google Cloud Run using GitHub Actions.

## Prerequisites

1. Google Cloud account with billing enabled
2. Google Cloud SDK installed locally (`gcloud`)
3. GitHub repository with admin access for adding secrets

## Step 1: Create Google Cloud Project

```bash
# Set your project ID
export PROJECT_ID="your-project-id"
export REGION="asia-south1"

# Create new project (or use existing)
gcloud projects create $PROJECT_ID --region=$REGION

# Set as active project
gcloud config set project $PROJECT_ID
```

## Step 2: Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com
```

## Step 3: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create ajrasakha-docker \
  --repository-format=docker \
  --location=$REGION \
  --description="Docker images for Ajrasakha application"
```

## Step 4: Create Service Account for GitHub Actions

```bash
# Create service account
gcloud iam service-accounts create github-actions-deployer \
  --display-name="GitHub Actions Deployer"

# Grant required roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## Step 5: Create Workload Identity Federation

```bash
# Create workload identity pool
gcloud iam workload-identity-pools create github-actions-pool \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Get pool ID
POOL_ID=$(gcloud iam workload-identity-pools describe github-actions-pool \
  --location="global" --format="value(name)")

# Create OIDC provider
gcloud iam workload-identity-pools providers create-oidc github-actions-provider \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --display-name="GitHub Actions OIDC Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository"
```

## Step 6: Allow GitHub Repository to Impersonate Service Account

```bash
# Replace with your actual GitHub repository
REPO="vicharanashala/ajrasakha"

gcloud iam service-accounts add-iam-policy-binding \
  github-actions-deployer@$PROJECT_ID.iam.gserviceaccount.com \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_ID/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/$REPO"
```

## Step 7: Get Workload Identity Provider Resource Name

```bash
gcloud iam workload-identity-pools providers describe github-actions-provider \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --format="value(name)"
```

This will output something like:
`projects/123456789/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider`

## Step 8: Add GitHub Secrets

Go to your GitHub repository → Settings → Secrets and add the following secrets:

### Required Secrets

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `GCP_PROJECT_ID` | Your Google Cloud Project ID | `my-project-123` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload identity provider resource name | `projects/123456789/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider` |
| `GCP_SERVICE_ACCOUNT` | Service account email | `github-actions-deployer@my-project-123.iam.gserviceaccount.com` |

### Backend Secrets

| Secret Name | Description |
|------------|-------------|
| `APP_SECRET` | Application secret key for authentication |
| `DATABASE_URL` | PostgreSQL/MySQL connection string |
| `CLOUD_RUN_MIN_INSTANCES_STAGING` | Min instances for staging (e.g., `0`) |
| `CLOUD_RUN_MAX_INSTANCES_STAGING` | Max instances for staging (e.g., `5`) |
| `CLOUD_RUN_MEMORY_STAGING` | Memory for staging (e.g., `512Mi`) |
| `CLOUD_RUN_MIN_INSTANCES_PROD` | Min instances for production (e.g., `1`) |
| `CLOUD_RUN_MAX_INSTANCES_PROD` | Max instances for production (e.g., `10`) |
| `CLOUD_RUN_MEMORY_PROD` | Memory for production (e.g., `1Gi`) |

### Frontend Secrets

| Secret Name | Description |
|------------|-------------|
| `FRONTEND_API_BASE_URL` | Backend API URL (e.g., `https://ajrasakha-backend-xxxx-uc.a.run.app`) |
| `VITE_FIREBASE_API_KEY` | Firebase API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase App ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Measurement ID (optional) |
| `VITE_SARVAM_API_KEY` | Sarvam API Key |
| `VITE_VAPID_PUBLIC_KEY` | VAPID Public Key for push notifications |

### Optional Repository Variables

| Variable Name | Description | Default |
|---------------|-------------|---------|
| `VITE_ENABLE_MOCKS` | Enable mock data for testing | `false` |

## Step 9: Create Cloud Run Services (Initial Deployment)

You can either let the GitHub Actions create the services on first deploy, or create them manually:

### Backend Service

```bash
gcloud run deploy ajrasakha-backend \
  --image="gcr.io/$PROJECT_ID/ajrasakha-backend:placeholder" \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=4000 \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi
```

### Frontend Service

```bash
gcloud run deploy ajrasakha-frontend \
  --image="gcr.io/$PROJECT_ID/ajrasakha-frontend:placeholder" \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=80 \
  --min-instances=1 \
  --max-instances=5 \
  --memory=256Mi
```

## Workflow Triggers

### Backend Workflow (`.github/workflows/backend-deploy.yml`)
- **Push to main**: Automatically deploys when code changes in `backend/` directory
- **Manual trigger**: Allows selecting staging or production environment

### Frontend Workflow (`.github/workflows/frontend-deploy.yml`)
- **Push to main**: Automatically deploys when code changes in `frontend/` directory
- **Manual trigger**: Allows selecting staging or production environment

## Deployment Flow

1. **Code Push** → Triggers workflow based on changed files
2. **Build** → Docker image is built with appropriate build args
3. **Push** → Image pushed to Google Artifact Registry
4. **Deploy** → Cloud Run service updated with new image
5. **Verify** → URL displayed in GitHub Actions logs

## Environment-Specific Configuration

The workflows support two environments:
- **Staging**: Lower resource limits, used for testing
- **Production**: Higher resource limits, used for live traffic

You can customize resource limits by updating the GitHub secrets:
- `CLOUD_RUN_MIN_INSTANCES_*`
- `CLOUD_RUN_MAX_INSTANCES_*`
- `CLOUD_RUN_MEMORY_*`

## Troubleshooting

### Authentication Issues
If you get authentication errors, verify:
1. Workload identity provider is correctly configured
2. Service account has proper IAM roles
3. GitHub secrets are correctly set

### Build Failures
Check that:
1. Dockerfiles are in correct locations
2. Build args match expected variables
3. Required secrets are set

### Deployment Issues
Ensure:
1. Cloud Run APIs are enabled
2. Artifact Registry repository exists
3. Service account has `roles/run.admin`

## Useful Commands

```bash
# View Cloud Run services
gcloud run services list --region=$REGION

# View deployment logs
gcloud run services logs read ajrasakha-backend --region=$REGION

# Update service manually
gcloud run services update ajrasakha-backend \
  --region=$REGION \
  --min-instances=1 \
  --max-instances=20