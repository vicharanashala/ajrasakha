import sys
from pathlib import Path
import uvicorn

backend_dir = Path(__file__).resolve().parent
root_dir = backend_dir.parent

for p in [str(backend_dir), str(root_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

if __name__ == "__main__":
    print("Starting AjraSakha Backend on http://127.0.0.1:8000 ...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True, app_dir=str(backend_dir))
