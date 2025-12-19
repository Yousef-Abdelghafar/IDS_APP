import json
import time
import random
import requests
import os

API_BASE = os.getenv("API_BASE", "http://ids-backend:8000")
ENDPOINT = "/predict"
INTERVAL = float(os.getenv("INTERVAL", "1.0"))

FEATURES_FILE = "/app/feature_names.json"


def load_feature_names():
    with open(FEATURES_FILE, "r") as f:
        return json.load(f)


def generate_payload(feature_names):
    payload = {}
    for feat in feature_names:
        # قيم عشوائية منطقية (IDS-style)
        payload[feat] = random.random() * random.randint(1, 100)
    return payload


def main():
    url = API_BASE.rstrip("/") + ENDPOINT
    feature_names = load_feature_names()

    print(f"[generator] sending traffic to {url}")
    print(f"[generator] features count = {len(feature_names)}")

    i = 0
    while True:
        i += 1
        payload = generate_payload(feature_names)
        try:
            r = requests.post(url, json=payload, timeout=5)
            print(f"[{i}] {r.status_code} -> {r.json()}")
        except Exception as e:
            print(f"[{i}] ERROR: {e}")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
