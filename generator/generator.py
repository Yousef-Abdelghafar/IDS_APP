import os
import json
import time
import random
import requests

API_BASE = os.environ.get("API_BASE", "http://ids-backend:8000").rstrip("/")
INTERVAL = float(os.environ.get("INTERVAL", "1.0"))

FEATURES_PATH = os.environ.get("FEATURES_PATH", "/app/feature_names.json")

def load_features():
    try:
        with open(FEATURES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # يدعم list أو dict
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # لو عندك key معين
            for k in ["feature_names", "features", "columns"]:
                if k in data and isinstance(data[k], list):
                    return data[k]
        return []
    except Exception as e:
        print(f"[generator] Failed to load feature names: {e}")
        return []

FEATURE_NAMES = load_features()

def get_monitor_status():
    try:
        return requests.get(f"{API_BASE}/monitor/status", timeout=2).json()
    except Exception:
        return {"running": False}

def get_source_status():
    try:
        return requests.get(f"{API_BASE}/source/status", timeout=2).json()
    except Exception:
        return {"source": "unknown"}

def random_payload():
    payload = {}
    if FEATURE_NAMES:
        for name in FEATURE_NAMES:
            payload[name] = round(random.random() * 100, 6)
    else:
        # fallback بسيط
        payload = {
            "Flow Duration": random.randint(100, 50000),
            "Total Fwd Packets": random.randint(1, 50),
            "Total Backward Packets": random.randint(1, 50),
        }
    return payload

def main():
    print(f"[generator] API_BASE={API_BASE} INTERVAL={INTERVAL}s FEATURES={len(FEATURE_NAMES)}")

    while True:
        mon = get_monitor_status()
        src = get_source_status()

        if not mon.get("running", False):
            time.sleep(INTERVAL)
            continue

        if src.get("source") != "generator":
            # dataset replay شغال أو manual mode
            time.sleep(INTERVAL)
            continue

        try:
            payload = random_payload()
            r = requests.post(f"{API_BASE}/predict", json=payload, timeout=5)
            if r.status_code == 200:
                data = r.json()
                print(f"[generator] OK -> {data.get('label')} ({data.get('probability')})")
            else:
                print(f"[generator] {r.status_code}: {r.text[:120]}")
        except Exception as e:
            print(f"[generator] error: {e}")

        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
