# IndicOCR Model Server

Document parsing for English and 22 Indian languages using [Bodhan AI's IndicOCR](https://huggingface.co/bodhan-ai/indic-ocr).

## Model Architecture

- **IndicDocLayout**: Layout detection + reading order (PP-DocLayoutV3 / RT-DETR, 33M params)
- **IndicBlockOCR**: Block-level text recognition (Qwen3.5-0.8B)

## API Endpoints

### POST /parse
Upload an image for OCR processing.

**Form Field**: `image` (image file: png, jpg, jpeg, tiff, webp, bmp)

**Response**:
```json
{
  "image": "document.png",
  "width": 800,
  "height": 1200,
  "markdown": "# Document Title\n\nText content here...",
  "blocks": [
    {
      "order": 1,
      "label": "Title",
      "type": "text",
      "bbox_xyxy": [x1, y1, x2, y2],
      "conf": 0.95,
      "text": "Document Title"
    }
  ]
}
```

### GET /health
Health check endpoint.

## Usage with Docker

### Pull the image from Docker Hub
```bash
docker pull <your-username>/indic-ocr:latest
```

### Run with GPU support (NVIDIA Docker required)
```bash
docker run --gpus all -p 8000:8000 --rm \
  --shm-size=2g \
  <your-username>/indic-ocr:latest
```

### Run with custom PORT
```bash
docker run --gpus all -p 9000:9000 -e PORT=9000 --rm \
  --shm-size=2g \
  <your-username>/indic-ocr:latest
```

### Portainer Deployment Notes

1. **GPU Support**: Ensure your Portainer node has NVIDIA GPU drivers and NVIDIA Container Toolkit installed
2. **Memory**: The model requires ~6GB RAM minimum, recommended 8GB+
3. **Startup Time**: First request takes 2-3 minutes (vLLM engine warmup)
4. **Health Check**: Uses `/health` endpoint with 90s start period

## Docker Hub Image

The Docker image is automatically built and pushed via GitHub Actions workflow: `.github/workflows/dockerhub-indic-ocr.yml`

### Image Tags
- `latest` - Most recent build
- `<commit-sha>` - Specific commit for reproducibility

## Build Locally (if needed)

```bash
# Set HF_TOKEN for gated models
export HF_TOKEN="your-huggingface-token"

# Build the image
docker build -t indic-ocr \
  --build-arg HF_TOKEN="$HF_TOKEN" \
  .

# Run it
docker run --gpus all -p 8000:8000 indic-ocr
```

## Requirements

- NVIDIA GPU with CUDA 12.4+ support
- Docker with NVIDIA Container Toolkit
- ~8GB disk space for the model weights

## License

This model is released under the [Indic Open Model License v1.0](https://github.com/Bodhan-AI/bodhan-model-info/blob/main/licenses/indic-open-model-license/v1/Indic_Open_Model_License.md). See the HuggingFace model page for full details.