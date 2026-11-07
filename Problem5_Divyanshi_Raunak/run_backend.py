import sys
from pathlib import Path
import uvicorn

root_dir = Path(__file__).resolve().parent
backend_dir = root_dir / "backend"

for p in [str(backend_dir), str(root_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

if __name__ == "__main__":
    from backend.app.config import settings
    print(f"Starting AjraSakha Backend on http://{settings.BACKEND_HOST}:{settings.BACKEND_PORT} ...")
    uvicorn.run("app.main:app", host=settings.BACKEND_HOST, port=settings.BACKEND_PORT, reload=True, app_dir=str(backend_dir))

