import json
import joblib
import numpy as np
from pathlib import Path
from typing import Dict, Tuple

# ==============================
# Paths
# ==============================
BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

MODEL_PATH = MODELS_DIR / "xgb_ids_model.joblib"
SCALER_PATH = MODELS_DIR / "robust_scaler.pkl"
FEATURES_PATH = MODELS_DIR / "feature_names.json"

# ==============================
# Load Model
# ==============================
print("📌 Loading XGBoost model...")
model = joblib.load(MODEL_PATH)

# ==============================
# Load Scaler
# ==============================
try:
    scaler = joblib.load(SCALER_PATH)
    print("📌 RobustScaler loaded.")
except:
    scaler = None
    print("⚠️ No scaler found, continuing without scaling.")

# ==============================
# Load Feature Names
# ==============================
with open(FEATURES_PATH, "r") as f:
    FEATURE_NAMES = json.load(f)

print(f"📌 Loaded {len(FEATURE_NAMES)} feature names.")

# ==============================
# Feature Vector Builder
# ==============================
def build_feature_vector(features_dict: Dict) -> np.ndarray:
    """
    Convert incoming JSON dict into a feature vector
    following the SAME original training order.
    Missing features = 0.
    """
    values = []
    for name in FEATURE_NAMES:
        value = features_dict.get(name, 0)
        try:
            value = float(value)
        except:
            value = 0.0
        values.append(value)

    x = np.array(values).reshape(1, -1)
    
    if scaler is not None:
        x = scaler.transform(x)

    return x

# ==============================
# Prediction Function
# ==============================
LABEL_MAP = {
    0: "BENIGN",
    1: "ATTACK"
}

def predict_sample(features_dict: Dict) -> Tuple[str, float]:
    """
    Runs prediction using the trained XGBoost model.
    Returns readable label + probability.
    """
    x = build_feature_vector(features_dict)

    # Predict probabilities
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(x)[0]
        pred_idx = int(np.argmax(proba))
        raw_label = model.classes_[pred_idx]
        pred_prob = float(proba[pred_idx])
    else:
        raw_label = model.predict(x)[0]
        pred_prob = 1.0

    # Convert numeric label (0/1) → real name
    final_label = LABEL_MAP.get(raw_label, str(raw_label))

    return final_label, pred_prob
