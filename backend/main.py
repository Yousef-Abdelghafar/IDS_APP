from fastapi import FastAPI, UploadFile, File, Query, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, Deque, Optional
from collections import deque
from datetime import datetime
import threading
import pandas as pd
import io
import random
import time
import uuid
import os

from model_loader import predict_sample  # زي ما هو عندك

app = FastAPI(title="IDS Backend API", version="1.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # عدلها في production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================= MONITORING STATE =================
monitoring_state = {
    "running": False,
    "started_at": None,
    "stopped_at": None,
}
monitor_lock = threading.Lock()

# ================= TRAFFIC SOURCE MODE =================
# الهدف: منع generator و dataset replay يشتغلوا مع بعض ويتلخبطوا
# source = "generator" | "dataset"
SOURCE_LOCK = threading.Lock()
traffic_source = os.environ.get("TRAFFIC_SOURCE", "generator").strip().lower()
if traffic_source not in ("generator", "dataset"):
    traffic_source = "generator"

def _get_source() -> str:
    with SOURCE_LOCK:
        return traffic_source

def _set_source(src: str) -> str:
    global traffic_source
    src = (src or "").strip().lower()
    if src not in ("generator", "dataset"):
        raise ValueError("source must be 'generator' or 'dataset'")
    with SOURCE_LOCK:
        traffic_source = src
    return traffic_source

# ================= STATS =================
lock = threading.Lock()
stats_state = {
    "total": 0,
    "benign": 0,
    "attack": 0,
    "last_prediction": None,
}
recent_preds: Deque[Dict[str, Any]] = deque(maxlen=200)

# ================= TEST JOBS (Batch Inference) =================
jobs_lock = threading.Lock()
test_jobs: Dict[str, Dict[str, Any]] = {}

def _job_create(total_rows: int, filename: str) -> str:
    job_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    with jobs_lock:
        test_jobs[job_id] = {
            "job_id": job_id,
            "type": "dataset_test",
            "filename": filename,
            "status": "queued",  # queued | running | done | failed
            "created_at": now,
            "updated_at": now,
            "processed": 0,
            "total": total_rows,
            "benign": 0,
            "attack": 0,
            "message": None,
        }
    return job_id

def _job_update(job_id: str, **kwargs):
    now = datetime.utcnow().isoformat()
    with jobs_lock:
        if job_id not in test_jobs:
            return
        test_jobs[job_id].update(kwargs)
        test_jobs[job_id]["updated_at"] = now

# ================= HELPERS =================
def _risk_from_label(label: str, prob: float) -> str:
    if label != "BENIGN":
        return "High" if prob >= 0.80 else "Medium"
    return "Low"

def _fake_ip() -> str:
    return f"192.168.1.{random.randint(2,254)}"

def _attack_type_from_label(label: str) -> str:
    if label == "BENIGN":
        return "Normal"
    if label.upper() == "ATTACK":
        return random.choice(["DDoS", "Port Scan", "Brute Force", "Botnet"])
    return label

def _require_monitoring():
    if not monitoring_state["running"]:
        raise HTTPException(status_code=409, detail="Monitoring is stopped. Start monitoring first.")

def _require_source(expected: str):
    src = _get_source()
    if src != expected:
        raise HTTPException(
            status_code=423,
            detail=f"Traffic source is '{src}'. This endpoint requires source='{expected}'."
        )

def _read_table_bytes(filename: str, content: bytes) -> pd.DataFrame:
    fn = filename.lower()
    if fn.endswith(".csv"):
        return pd.read_csv(io.BytesIO(content))
    if fn.endswith(".parquet"):
        return pd.read_parquet(io.BytesIO(content))
    if fn.endswith(".json"):
        return pd.read_json(io.BytesIO(content))
    raise ValueError("Unsupported file type (use .csv/.parquet/.json)")

def _push_prediction_to_dashboard(label: str, prob: float):
    item = {
        "time": datetime.now().strftime("%H:%M:%S"),
        "label": label,
        "probability": round(float(prob), 4),
        "src": _fake_ip(),
        "dst": _fake_ip(),
        "type": _attack_type_from_label(label),
        "risk": _risk_from_label(label, float(prob)),
    }

    with lock:
        stats_state["total"] += 1
        if label == "BENIGN":
            stats_state["benign"] += 1
        else:
            stats_state["attack"] += 1

        stats_state["last_prediction"] = {"label": label, "probability": round(float(prob), 4)}
        recent_preds.appendleft(item)

# ================= ROOT =================
@app.get("/")
def root():
    return {"status": "ok", "monitoring": monitoring_state["running"], "source": _get_source()}

# ================= SOURCE CONTROL =================
@app.get("/source/status")
def source_status():
    return {"source": _get_source()}

@app.post("/source/set")
def source_set(source: str = Query(..., description="generator or dataset")):
    try:
        new_src = _set_source(source)
        return {"status": "ok", "source": new_src}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ================= MONITOR CONTROL =================
@app.get("/monitor/start")
def start_monitoring():
    with monitor_lock:
        monitoring_state["running"] = True
        monitoring_state["started_at"] = datetime.utcnow().isoformat()
        monitoring_state["stopped_at"] = None
    return {"status": "ok", "monitoring": True}

@app.get("/monitor/stop")
def stop_monitoring():
    with monitor_lock:
        monitoring_state["running"] = False
        monitoring_state["stopped_at"] = datetime.utcnow().isoformat()
    return {"status": "ok", "monitoring": False}

@app.get("/monitor/status")
def monitor_status():
    return monitoring_state

# ================= STATS =================
@app.get("/stats")
def get_stats():
    with lock:
        total = stats_state["total"]
        benign = stats_state["benign"]
        attack = stats_state["attack"]
        return {
            "total": total,
            "benign": benign,
            "attack": attack,
            "benign_pct": round((benign / total) * 100, 1) if total else 0,
            "attack_pct": round((attack / total) * 100, 1) if total else 0,
            "last_prediction": stats_state["last_prediction"],
        }

@app.post("/stats/reset")
def reset_stats():
    with lock:
        stats_state.update({"total": 0, "benign": 0, "attack": 0, "last_prediction": None})
        recent_preds.clear()
    return {"status": "ok"}

# ================= PREDICT (Single) =================
@app.post("/predict")
async def predict(payload: Dict[str, Any]):
    _require_monitoring()
    _require_source("generator")  # ✅ generator only

    label, prob = predict_sample(payload)
    _push_prediction_to_dashboard(label, float(prob))
    return recent_preds[0]

# ================= RECENT =================
@app.get("/recent")
def recent(limit: int = Query(20, ge=1, le=200)):
    if not monitoring_state["running"]:
        return {"items": []}
    with lock:
        return {"items": list(recent_preds)[:limit]}

@app.get("/recent/alerts")
def recent_alerts(limit: int = Query(20, ge=1, le=200)):
    if not monitoring_state["running"]:
        return {"items": []}
    with lock:
        attacks = [x for x in recent_preds if x["label"] != "BENIGN"]
        return {"items": attacks[:limit]}

# ================= DATASET (Old endpoint - keep for UI compatibility) =================
@app.post("/upload-dataset/")
async def upload_dataset(
    mode: str = Query("train"),
    file: UploadFile = File(...)
):
    # ده زي ما هو عندك: مجرد info (rows/cols)
    content = await file.read()
    try:
        df = _read_table_bytes(file.filename, content)
        return {"status": "ok", "mode": mode, "rows": int(df.shape[0]), "cols": int(df.shape[1])}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ==========================================================
# ✅ NEW: DATASET TEST (Replay) -> pushes to dashboard "real-time"
# ==========================================================

def _run_test_job(job_id: str, df: pd.DataFrame, max_rows: int, sleep_ms: int):
    prev_source = _get_source()
    try:
        # switch source to dataset for the duration of replay
        _set_source("dataset")

        _job_update(job_id, status="running", message="Testing started...")
        processed = 0
        benign = 0
        attack = 0

        total = min(len(df), max_rows)

        for i in range(total):
            # لو عمل Stop monitoring أثناء الريپلاي
            if not monitoring_state["running"]:
                _job_update(job_id, status="failed", message="Monitoring stopped during dataset test.")
                return

            row = df.iloc[i].to_dict()

            label, prob = predict_sample(row)

            if label == "BENIGN":
                benign += 1
            else:
                attack += 1

            _push_prediction_to_dashboard(label, float(prob))
            processed += 1

            if processed % 25 == 0:
                _job_update(
                    job_id,
                    processed=processed,
                    benign=benign,
                    attack=attack,
                    message=f"Processed {processed}/{total}"
                )

            if sleep_ms > 0:
                time.sleep(sleep_ms / 1000.0)

        _job_update(job_id, status="done", processed=processed, benign=benign, attack=attack, message="Dataset test done.")
    except Exception as e:
        _job_update(job_id, status="failed", message=str(e))
    finally:
        # restore previous source
        try:
            _set_source(prev_source)
        except Exception:
            # لو prev_source كان غلط لأي سبب
            _set_source("generator")

@app.post("/dataset/test")
async def dataset_test(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    max_rows: int = Query(500, ge=1, le=50000),
    sleep_ms: int = Query(0, ge=0, le=1000),
):
    """
    Upload a file of flows/logs (csv/parquet/json) then replay it row-by-row.
    Results will appear in:
    - /stats
    - /recent
    - /recent/alerts
    """
    _require_monitoring()

    content = await file.read()
    df = _read_table_bytes(file.filename, content)

    job_id = _job_create(total_rows=min(len(df), max_rows), filename=file.filename)
    background.add_task(_run_test_job, job_id, df, max_rows, sleep_ms)

    return {
        "status": "ok",
        "job_id": job_id,
        "rows_detected": int(df.shape[0]),
        "max_rows": max_rows,
        "sleep_ms": sleep_ms,
    }

@app.get("/dataset/test/status")
def dataset_test_status(job_id: str):
    with jobs_lock:
        job = test_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
