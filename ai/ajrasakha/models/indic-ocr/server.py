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

# =============================================================================
# Bodhan GenAI Package Setup
# =============================================================================
# The bodhan_genai package may be installed in different locations depending on
# the Docker build. Try multiple paths to find it.

_REPO_PATH = os.environ.get("INDIC_OCR_REPO_PATH", "/tmp/indic-ocr")

# Common locations where indic_ocr might be installed
_potential_paths = [
    _REPO_PATH,
    _REPO_PATH + "/src",  # src-layout packages
    "/opt/venv/lib/python3.11/site-packages",  # venv site-packages
    "/opt/venv/lib/python3.12/site-packages",  # venv site-packages (py3.12)
]

for _p in _potential_paths:
    _parent = os.path.dirname(_p)
    if _parent not in sys.path and os.path.exists(_parent):
        sys.path.insert(0, _parent)

# Debug: Log paths for troubleshooting
import pprint
print(f"[DEBUG] sys.path entries: {pprint.pformat(sys.path)}")
print(f"[DEBUG] _REPO_PATH={_REPO_PATH}")
if os.path.exists(_REPO_PATH):
    print(f"[DEBUG] Repo contents: {os.listdir(_REPO_PATH)}")

# Try to import indic_ocr.IndicOCR
# The repo structure has indic_ocr.py directly

IndicOCR = None
_import_error = None

# Try different import paths
_import_strategies = [
    ("indic_ocr", "IndicOCR"),  # Main module with class
    ("indic_ocr.ocr", "IndicOCR"),  # Submodule
]

for _module_name, _class_name in _import_strategies:
    try:
        _module = __import__(_module_name, fromlist=[_class_name] if _class_name else [''])
        if _class_name:
            IndicOCR = getattr(_module, _class_name)
        else:
            # Try common class names
            for _name in ["IndicOCR", "OCR", "Parser"]:
                if hasattr(_module, _name):
                    IndicOCR = getattr(_module, _name)
                    break
        if IndicOCR is not None:
            print(f"[DEBUG] Successfully imported {IndicOCR} from {_module_name}")
            break
    except (ImportError, AttributeError) as e:
        _import_error = e
        continue

if IndicOCR is None:
    # List what's available for debugging
    import pkgutil
    _ocr_pkgs = [_n for _, _n, _ in pkgutil.iter_modules() if 'ocr' in _n.lower() or 'indic' in _n.lower()]
    print(f"[DEBUG] Packages with 'ocr' or 'indic': {_ocr_pkgs}")
    
    if _import_error:
        raise ImportError(
            f"Failed to import IndicOCR. Tried paths: {_potential_paths}\n"
            f"Last error: {_import_error}"
        ) from _import_error
    else:
        raise ImportError(
            f"Could not find IndicOCR class in indic_ocr module.\n"
            f"Available related packages: {_ocr_pkgs}"
        )

# =============================================================================
# FastAPI Application Setup
# =============================================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global parser instance (shared across requests)
_parser = None


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