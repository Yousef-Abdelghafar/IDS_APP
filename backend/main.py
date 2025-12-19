from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, Deque
from collections import deque
from datetime import datetime
import threading
import pandas as pd
import io
import random

from model_loader import predict_sample  # <-- لازم يكون موجود عندك زي ما هو

app = FastAPI(title="IDS Backend API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====== Monitoring flag ======
monitoring_state = {"running": False}

# ====== Stats + Recent buffer ======
lock = threading.Lock()

stats_state = {
    "total": 0,
    "benign": 0,
    "attack": 0,
    "last_prediction": None,  # {"label": "...", "probability": 0.1234}
}

# آخر 200 prediction
recent_preds: Deque[Dict[str, Any]] = deque(maxlen=200)


def _risk_from_label(label: str, prob: float) -> str:
    # لو Attack فـ High/Medium حسب الثقة
    if label != "BENIGN":
        return "High" if prob >= 0.80 else "Medium"
    return "Low"


def _fake_ip() -> str:
    return f"192.168.1.{random.randint(2, 254)}"


def _attack_type_from_label(label: str) -> str:
    # لو موديل Binary: BENIGN / ATTACK
    if label == "BENIGN":
        return "Normal"
    if label.upper() == "ATTACK":
        return random.choice(["DDoS", "Port Scan", "Brute Force", "Botnet"])
    # لو الموديل بيرجع اسم هجوم أصلاً
    return label


@app.get("/")
def root():
    return {"status": "ok", "message": "IDS FastAPI backend running"}


# ========= STATS =========
@app.get("/stats")
def get_stats():
    with lock:
        total = stats_state["total"]
        benign = stats_state["benign"]
        attack = stats_state["attack"]
        benign_pct = round((benign / total) * 100, 1) if total else 0.0
        attack_pct = round((attack / total) * 100, 1) if total else 0.0

        return {
            "total": total,
            "benign": benign,
            "attack": attack,
            "benign_pct": benign_pct,
            "attack_pct": attack_pct,
            "last_prediction": stats_state["last_prediction"],
        }


@app.post("/stats/reset")
def reset_stats():
    with lock:
        stats_state["total"] = 0
        stats_state["benign"] = 0
        stats_state["attack"] = 0
        stats_state["last_prediction"] = None
        recent_preds.clear()
    return {"status": "ok", "message": "Stats reset."}


# ========= REAL MODEL PREDICT =========
@app.post("/predict")
async def predict(payload: Dict[str, Any]):
    """
    Use the trained XGBoost model to classify a single flow.
    JSON body must contain the same feature names used in training.
    """
    label, prob = predict_sample(payload)
    prob = float(prob)
    prob_round = round(prob, 4)

    now = datetime.now().strftime("%H:%M:%S")
    risk = _risk_from_label(label, prob)
    attack_type = _attack_type_from_label(label)

    # سجل prediction
    item = {
        "time": now,
        "label": label,
        "probability": prob_round,
        "src": _fake_ip(),
        "dst": _fake_ip(),
        "type": attack_type,
        "risk": risk,
    }

    with lock:
        stats_state["total"] += 1
        if label == "BENIGN":
            stats_state["benign"] += 1
        else:
            stats_state["attack"] += 1

        stats_state["last_prediction"] = {"label": label, "probability": prob_round}
        recent_preds.appendleft(item)

    return {
        "label": label,
        "probability": prob_round,
        "received_features": payload,
    }


# ========= RECENT FEED =========
@app.get("/recent")
def recent(limit: int = Query(20, ge=1, le=200)):
    with lock:
        return {"items": list(recent_preds)[:limit]}


@app.get("/recent/alerts")
def recent_alerts(limit: int = Query(20, ge=1, le=200)):
    with lock:
        attacks = [x for x in recent_preds if x.get("label") != "BENIGN"]
        return {"items": attacks[:limit]}


# ========= DATASET UPLOAD =========
@app.post("/upload-dataset/")
async def upload_dataset(
    mode: str = Query("train", description="train or test"),
    file: UploadFile = File(...),
):
    content = await file.read()

    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith(".parquet"):
            df = pd.read_parquet(io.BytesIO(content))
        elif file.filename.endswith(".json"):
            df = pd.read_json(io.BytesIO(content))
        else:
            return {"status": "error", "message": f"Unsupported file type: {file.filename}"}

        n_rows, n_cols = df.shape

        msg = (
            f"Training dataset received with {n_rows} rows and {n_cols} columns."
            if mode == "train"
            else f"Dataset for analysis received with {n_rows} rows and {n_cols} columns."
        )

        return {
            "status": "ok",
            "mode": mode,
            "rows": int(n_rows),
            "cols": int(n_cols),
            "message": msg,
        }

    except Exception as e:
        return {"status": "error", "message": f"Failed to process dataset: {str(e)}"}


# ========= MONITORING (flags) =========
@app.get("/monitor/start")
def start_monitoring():
    monitoring_state["running"] = True
    return {"status": "ok", "monitoring": True, "message": "Monitoring started."}


@app.get("/monitor/stop")
def stop_monitoring():
    monitoring_state["running"] = False
    return {"status": "ok", "monitoring": False, "message": "Monitoring stopped."}
