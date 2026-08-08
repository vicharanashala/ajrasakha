"""
train_model.py — One-time XGBoost training script for Crop Recommendation.

Trains an XGBoost classifier on the Crop_recommendation.csv dataset and exports:
  - model/crop_model.pkl       (trained XGBoost model)
  - model/label_encoder.pkl    (LabelEncoder for crop name ↔ integer mapping)

Usage:
    cd mcp/crop_recommendation
    python train_model.py

Features (7 inputs):
    N            — Nitrogen content in soil (kg/ha)
    P            — Phosphorus content in soil (kg/ha)
    K            — Potassium content in soil (kg/ha)
    temperature  — Average temperature (°C)
    humidity     — Relative humidity (%)
    ph           — Soil pH value
    rainfall     — Annual rainfall (mm)

Target:
    label        — Crop name (22 classes: rice, maize, chickpea, ... coffee)
"""

import os
import sys
import pickle
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from xgboost import XGBClassifier


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "data", "Crop_recommendation.csv")
MODEL_DIR = os.path.join(SCRIPT_DIR, "model")
MODEL_PATH = os.path.join(MODEL_DIR, "crop_model.pkl")
ENCODER_PATH = os.path.join(MODEL_DIR, "label_encoder.pkl")

FEATURE_COLUMNS = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
TARGET_COLUMN = "label"


def main():
    # ------------------------------------------------------------------
    # 1. Load dataset
    # ------------------------------------------------------------------
    print(f"Loading dataset from {DATA_PATH} ...")
    if not os.path.isfile(DATA_PATH):
        print(f"ERROR: Dataset not found at {DATA_PATH}")
        sys.exit(1)

    df = pd.read_csv(DATA_PATH)
    print(f"  Rows: {len(df)}, Columns: {list(df.columns)}")
    print(f"  Unique crops ({df[TARGET_COLUMN].nunique()}): "
          f"{sorted(df[TARGET_COLUMN].unique())}\n")

    # ------------------------------------------------------------------
    # 2. Validate and clean
    # ------------------------------------------------------------------
    # Drop rows with any NaN in feature or target columns
    required = FEATURE_COLUMNS + [TARGET_COLUMN]
    before = len(df)
    df = df.dropna(subset=required)
    if len(df) < before:
        print(f"  Dropped {before - len(df)} rows with missing values.")

    X = df[FEATURE_COLUMNS].values
    y_raw = df[TARGET_COLUMN].values

    # ------------------------------------------------------------------
    # 3. Encode target labels
    # ------------------------------------------------------------------
    le = LabelEncoder()
    y = le.fit_transform(y_raw)
    print(f"Label mapping ({len(le.classes_)} classes):")
    for idx, cls in enumerate(le.classes_):
        print(f"  {idx:2d} -> {cls}")
    print()

    # ------------------------------------------------------------------
    # 4. Train / test split (80:20, stratified)
    # ------------------------------------------------------------------
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"Train size: {len(X_train)}, Test size: {len(X_test)}\n")

    # ------------------------------------------------------------------
    # 5. Train XGBoost classifier
    # ------------------------------------------------------------------
    print("Training XGBoost classifier ...")
    model = XGBClassifier(
        n_estimators=150,
        max_depth=6,
        learning_rate=0.1,
        objective="multi:softprob",
        num_class=len(le.classes_),
        eval_metric="mlogloss",
        random_state=42,
        use_label_encoder=False,
        verbosity=0,
    )
    model.fit(X_train, y_train)
    print("  Training complete.\n")

    # ------------------------------------------------------------------
    # 6. Evaluate
    # ------------------------------------------------------------------
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"Test Accuracy: {accuracy:.4f}  ({accuracy * 100:.2f}%)\n")
    print("Classification Report:")
    print(classification_report(
        y_test, y_pred,
        target_names=le.classes_,
        digits=3,
    ))

    # ------------------------------------------------------------------
    # 7. Export model artifacts
    # ------------------------------------------------------------------
    os.makedirs(MODEL_DIR, exist_ok=True)

    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)
    print(f"Saved model     -> {MODEL_PATH}")

    with open(ENCODER_PATH, "wb") as f:
        pickle.dump(le, f)
    print(f"Saved encoder   -> {ENCODER_PATH}")

    # ------------------------------------------------------------------
    # 8. Quick sanity check with the example from the README
    # ------------------------------------------------------------------
    print("\n--- Sanity Check ---")
    sample = np.array([[90, 42, 43, 20.87, 82.00, 6.50, 202.93]])
    pred_idx = model.predict(sample)[0]
    pred_crop = le.inverse_transform([pred_idx])[0]
    proba = model.predict_proba(sample)[0]
    confidence = float(proba[pred_idx])
    print(f"Input:  N=90, P=42, K=43, temp=20.87, hum=82.0, pH=6.5, rain=202.93")
    print(f"Output: {pred_crop} (confidence: {confidence:.4f})")


if __name__ == "__main__":
    main()
