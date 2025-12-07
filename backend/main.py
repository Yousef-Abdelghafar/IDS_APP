from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import pandas as pd
import io

from model_loader import predict_sample  # ← هنا بنستورد الموديل

app = FastAPI(
    title="IDS Backend API",
    description="FastAPI backend for IDS dashboard",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

monitoring_state = {"running": False}


@app.get("/")
def root():
    return {"status": "ok", "message": "IDS FastAPI backend running"}


# ========= REAL MODEL PREDICT =========
@app.post("/predict")
async def predict(payload: Dict[str, Any]):
    """
    Use the trained XGBoost model to classify a single flow.
    JSON body must contain the same feature names used in training.
    """
    label, prob = predict_sample(payload)

    return {
        "label": label,
        "probability": round(prob, 4),
        "received_features": payload,
    }


# ========= DATASET UPLOAD (dummy processing) =========
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
            return {
                "status": "error",
                "message": f"Unsupported file type: {file.filename}",
            }

        n_rows, n_cols = df.shape

        if mode == "train":
            msg = (
                f"Training dataset received with {n_rows} rows and "
                f"{n_cols} columns. (Dummy training performed)"
            )
        else:
            msg = (
                f"Dataset for analysis received with {n_rows} rows and "
                f"{n_cols} columns. (Dummy analysis performed)"
            )

        return {
            "status": "ok",
            "mode": mode,
            "rows": int(n_rows),
            "cols": int(n_cols),
            "message": msg,
        }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to process dataset: {str(e)}",
        }


# ========= MONITORING (demo flags) =========
@app.get("/monitor/start")
def start_monitoring():
    monitoring_state["running"] = True
    return {
        "status": "ok",
        "monitoring": True,
        "message": "Monitoring started (demo flag in backend).",
    }


@app.get("/monitor/stop")
def stop_monitoring():
    monitoring_state["running"] = False
    return {
        "status": "ok",
        "monitoring": False,
        "message": "Monitoring stopped (demo flag in backend).",
    }
