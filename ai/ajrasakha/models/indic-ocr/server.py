"""
IndicOCR FastAPI Server
------------------------
Exposes a single `/parse` POST endpoint that accepts an image file and returns
the OCR result as JSON (markdown + per-block details).

POST /parse
  Form field : "image"  (image file: png, jpg, jpeg, tiff, webp, bmp)
  Returns    : JSON with "markdown", "blocks", "width", "height", "image"

GET /health
  Returns    : {"status": "ok"}

The server loads the model once at startup (vLLM engine warm-up).  Subsequent
requests reuse the engine and are served as fast as the GPU can decode.
"""

import io
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

# Ensure the cloned repo is on the path so `from bodhan_genai.ocr` works
_REPO_PATH = os.environ.get("INDIC_OCR_REPO_PATH", "/tmp/indic-ocr")
if _REPO_PATH not in sys.path:
    sys.path.insert(0, _REPO_PATH)

from bodhan_genai.ocr import IndicOCR  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global parser instance (shared across requests)
_parser: IndicOCR | None = None


def get_parser() -> IndicOCR:
    """Lazily create (or return) the global IndicOCR parser."""
    global _parser
    if _parser is None:
        logger.info("Initialising IndicOCR (loading vLLM engine — this takes ~2-3 min)…")
        _parser = IndicOCR.from_pretrained(_REPO_PATH)
        logger.info("IndicOCR ready.")
    return _parser


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up the model when the server starts."""
    # Trigger eager load so the health-check endpoint can report true readiness
    get_parser()
    yield


app = FastAPI(
    title="IndicOCR API",
    description="Document parsing for English and 22 Indian languages — powered by Bodhan AI.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Liveness probe — tells Portainer the container is alive."""
    return {"status": "ok"}


@app.post("/parse")
async def parse_image(image: UploadFile = File(...)):
    """
    Parse a document page image and return reading-ordered Markdown + block details.

    Parameters
    ----------
    image : UploadFile
        A document page image (PNG, JPEG, TIFF, WEBP, BMP, PDF first page).

    Returns
    -------
    JSON
        {
          "image": "<original filename>",
          "width": int,
          "height": int,
          "markdown": str,
          "blocks": [ { "order", "label", "type", "bbox_xyxy", "conf", "text" }, … ]
        }
    """
    if _parser is None:
        raise HTTPException(status_code=503, detail="Model not initialised yet. Try again in a minute.")

    # Read uploaded file into memory
    contents = await image.read()

    # Validate that PIL can open it
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(contents))
        img.verify()
        img = Image.open(io.BytesIO(contents))  # re-open after verify
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not decode image: {e}")

    # Write to a temp file — the parser expects a path
    tmp = Path("/tmp") / f"{os.urandom(8).hex()}_{image.filename or 'page.png'}"
    try:
        tmp.write_bytes(contents)

        parser = get_parser()
        result = parser.parse(str(tmp))

        return JSONResponse(
            content={
                "image": image.filename or "unknown",
                "width": result.get("width"),
                "height": result.get("height"),
                "markdown": result.get("markdown", ""),
                "blocks": result.get("blocks", []),
            }
        )
    finally:
        tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, workers=1)