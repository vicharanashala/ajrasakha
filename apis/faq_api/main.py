import os
import sys
import json
import uuid
import shutil
import subprocess
import threading
import time
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, List

from fastapi import FastAPI, UploadFile, File, Form, Query, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FAQ Cluster API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent / "data"
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
AUDIT_DIR = BASE_DIR / "audits"
STATE_TABLE = BASE_DIR / "state_table.json"

for d in [UPLOAD_DIR, OUTPUT_DIR, AUDIT_DIR]:
    d.mkdir(parents=True, exist_ok=True)
if not STATE_TABLE.exists():
    STATE_TABLE.write_text(json.dumps({"rows": []}))

jobs: Dict[str, dict] = {}
jobs_lock = threading.Lock()


def _load_state_table() -> List[Dict]:
    return json.loads(STATE_TABLE.read_text()).get("rows", [])


def _save_state_table(rows: List[Dict]) -> None:
    STATE_TABLE.write_text(json.dumps({"rows": rows}, indent=2, default=str))


def _path_for(state: str, district: str, crop: str) -> dict:
    s = state.replace(" ", "_")
    d = district.replace(" ", "_")
    c = crop.replace(" ", "_")
    return {
        "upload": UPLOAD_DIR / s / d / c,
        "output": OUTPUT_DIR / s / d / c,
        "audit": AUDIT_DIR / s / d / c,
    }


def _ensure_dirs(paths: dict) -> None:
    for p in paths.values():
        p.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# State table
# ---------------------------------------------------------------------------

@app.get("/app/state-table")
def get_state_table():
    return {"rows": _load_state_table()}


@app.get("/app/next-state")
def get_next_state(state: str = "", district: str = "", domains: List[str] = Query(default_factory=list)):
    rows = _load_state_table()
    return {"state": state, "district": district, "domains": domains}


@app.get("/app/output/{state}/{district}/{crop}")
def download_output(state: str, district: str, crop: str):
    paths = _path_for(state, district, crop)
    output_file = paths["output"] / "output.csv"
    if not output_file.exists():
        raise HTTPException(404, "Output file not found. Run the pipeline first.")
    rows = _load_state_table()
    updated = False
    for r in rows:
        if r["state"] == state and r["district"] == district and r["crop"] == crop:
            if not r.get("downloaded"):
                r["downloaded"] = True
                updated = True
            break
    if updated:
        _save_state_table(rows)
    return FileResponse(str(output_file), filename=f"{district}_{crop}.csv", media_type="text/csv")


# ---------------------------------------------------------------------------
# File management
# ---------------------------------------------------------------------------

@app.get("/files/tree")
def get_file_tree():
    tree = {"files": [], "folders": []}
    for base, label in [(UPLOAD_DIR, "uploads"), (OUTPUT_DIR, "outputs"), (AUDIT_DIR, "audits")]:
        if base.exists():
            for p in base.rglob("*"):
                if p.is_dir():
                    tree["folders"].append(str(p.relative_to(BASE_DIR)))
                elif p.is_file():
                    tree["files"].append(str(p.relative_to(BASE_DIR)))
    return tree


@app.get("/files/download/{path:path}")
def download_file(path: str):
    file_path = BASE_DIR / path
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(str(file_path), filename=file_path.name)


@app.post("/files/upload")
async def upload_file(file: UploadFile = File(...), dest: str = Form("")):
    dest_dir = UPLOAD_DIR
    if dest:
        dest_dir = dest_dir / dest
    dest_dir.mkdir(parents=True, exist_ok=True)
    save_path = dest_dir / file.filename
    content = await file.read()
    save_path.write_bytes(content)
    return {"status": "ok", "path": str(save_path.relative_to(BASE_DIR))}


@app.post("/files/upload-chunk")
async def upload_chunk(
    file: UploadFile = File(...),
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    filename: str = Form(...),
    dest: str = Form(""),
):
    tmp = BASE_DIR / ".chunks" / upload_id
    tmp.mkdir(parents=True, exist_ok=True)
    chunk_data = await file.read()
    (tmp / f"{chunk_index:05d}").write_bytes(chunk_data)

    if chunk_index == total_chunks - 1:
        dest_dir = UPLOAD_DIR
        if dest:
            dest_dir = dest_dir / dest
        dest_dir.mkdir(parents=True, exist_ok=True)
        save_path = dest_dir / filename
        with open(save_path, "wb") as out:
            for i in range(total_chunks):
                out.write((tmp / f"{i:05d}").read_bytes())
        shutil.rmtree(tmp, ignore_errors=True)
        return {"status": "ok", "path": str(save_path.relative_to(BASE_DIR))}
    return {"status": "chunk_received", "chunk_index": chunk_index}


@app.post("/files/upload-audited")
async def upload_audited(
    file: UploadFile = File(...),
    state: str = Form(...),
    district: str = Form(...),
    crop: str = Form(...),
):
    paths = _path_for(state, district, crop)
    _ensure_dirs(paths)
    save_path = paths["audit"] / file.filename
    content = await file.read()
    save_path.write_bytes(content)

    rows = _load_state_table()
    for r in rows:
        if r["state"] == state and r["district"] == district and r["crop"] == crop:
            r["audit_file"] = str(save_path.relative_to(BASE_DIR))
            r["audited"] = True
            break
    _save_state_table(rows)
    return {"status": "ok", "path": str(save_path.relative_to(BASE_DIR))}


@app.delete("/files/{path:path}")
def delete_file(path: str):
    file_path = BASE_DIR / path
    if not file_path.exists():
        raise HTTPException(404, "File not found")
    if file_path.is_file():
        file_path.unlink()
    return {"status": "deleted"}


@app.post("/files/rename/{path:path}")
async def rename_file(path: str, to: str = Form(...)):
    old = BASE_DIR / path
    if not old.exists():
        raise HTTPException(404, "Source not found")
    new = old.parent / to
    old.rename(new)
    return {"status": "renamed", "path": str(new.relative_to(BASE_DIR))}


@app.post("/files/folders")
async def create_folder(path: str = Form(...)):
    folder = BASE_DIR / path
    folder.mkdir(parents=True, exist_ok=True)
    return {"status": "created", "path": path}


@app.delete("/folders/{path:path}")
def delete_folder(path: str):
    folder = BASE_DIR / path
    if not folder.exists():
        raise HTTPException(404, "Folder not found")
    shutil.rmtree(folder)
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Pipeline execution
# ---------------------------------------------------------------------------

def _run_pipeline_script(script_name: str, args: List[str], job_id: str, cwd: Path) -> None:
    try:
        result = subprocess.run(
            [sys.executable, script_name, *args],
            capture_output=True, text=True, timeout=3600, cwd=cwd
        )
        stdout = result.stdout
        stderr = result.stderr
        finished_at = datetime.now(timezone.utc).isoformat()

        # If pipeline succeeded and this is a post/full run, update state table
        if result.returncode == 0:
            state, district, crop = args[0], args[1], args[2]
            output_dir = args[4]
            output_csv = Path(output_dir) / "output.csv"
            last_line = [l for l in stdout.strip().split("\n") if l.strip()][-1] if stdout.strip() else "{}"
            try:
                meta = json.loads(last_line)
                if "finished_at" in meta:
                    finished_at = meta["finished_at"]
            except json.JSONDecodeError:
                pass

            rows = _load_state_table()
            existing = None
            for r in rows:
                if r["state"] == state and r["district"] == district and r["crop"] == crop:
                    existing = r
                    break
            if existing:
                existing["finished_at"] = finished_at
                existing["downloaded"] = False
                if output_csv.exists():
                    existing["output_file"] = str(output_csv.relative_to(BASE_DIR))
            else:
                rows.append({
                    "state": state,
                    "district": district,
                    "crop": crop,
                    "domains": [],
                    "output_file": str(output_csv.relative_to(BASE_DIR)) if output_csv.exists() else None,
                    "audit_file": None,
                    "downloaded": False,
                    "audited": False,
                    "finished_at": finished_at,
                })
            _save_state_table(rows)

        with jobs_lock:
            jobs[job_id]["stdout"] = stdout
            jobs[job_id]["stderr"] = stderr
            jobs[job_id]["exit_code"] = result.returncode
            jobs[job_id]["status"] = "completed" if result.returncode == 0 else "failed"
            jobs[job_id]["finished_at"] = finished_at
    except subprocess.TimeoutExpired:
        with jobs_lock:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["stderr"] = "Pipeline timed out after 3600 seconds"
            jobs[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        with jobs_lock:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["stderr"] = str(e)
            jobs[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()


def _run_pipeline(state: str, district: str, crop: str, pipeline_type: str) -> str:
    job_id = str(uuid.uuid4())
    paths = _path_for(state, district, crop)
    _ensure_dirs(paths)

    script = {
        "pre": "pre_pipeline.py",
        "pipeline": "clustering.py",
        "post": "post_pipeline.py",
        "full": "full_pipeline.py",
    }.get(pipeline_type, "full_pipeline.py")

    script_path = Path(__file__).parent / "pipelines" / script

    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "status": "running",
            "state": state,
            "district": district,
            "crop": crop,
            "type": pipeline_type,
            "stdout": "",
            "stderr": "",
            "exit_code": None,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": None,
        }

    thread = threading.Thread(
        target=_run_pipeline_script,
        args=(str(script_path), [state, district, crop, str(paths["upload"]), str(paths["output"])], job_id, Path(__file__).parent),
        daemon=True,
    )
    thread.start()
    return job_id


@app.post("/run/pre")
async def run_pre(body: dict):
    job_id = _run_pipeline(body.get("state", ""), body.get("district", ""), body.get("crop", ""), "pre")
    return {"job_id": job_id, "status": "started"}


@app.post("/run/pipeline")
async def run_pipeline(body: dict):
    job_id = _run_pipeline(body.get("state", ""), body.get("district", ""), body.get("crop", ""), "pipeline")
    return {"job_id": job_id, "status": "started"}


@app.post("/run/post")
async def run_post(body: dict):
    job_id = _run_pipeline(body.get("state", ""), body.get("district", ""), body.get("crop", ""), "post")
    return {"job_id": job_id, "status": "started"}


@app.post("/run/full")
async def run_full(body: dict):
    job_id = _run_pipeline(body.get("state", ""), body.get("district", ""), body.get("crop", ""), "full")
    return {"job_id": job_id, "status": "started"}


# ---------------------------------------------------------------------------
# Job management
# ---------------------------------------------------------------------------

@app.get("/jobs")
def list_jobs():
    with jobs_lock:
        return {"jobs": list(jobs.values())}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    with jobs_lock:
        j = jobs.get(job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    return j


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str):
    with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(404, "Job not found")
        del jobs[job_id]
    return {"status": "deleted"}


@app.post("/jobs/{job_id}/stop")
def stop_job(job_id: str):
    with jobs_lock:
        j = jobs.get(job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    j["status"] = "stopped"
    j["finished_at"] = datetime.now(timezone.utc).isoformat()
    return {"status": "stopped"}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    print("Starting FAQ Cluster API on http://0.0.0.0:4001")
    uvicorn.run(app, host="0.0.0.0", port=4001)
