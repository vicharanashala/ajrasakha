"""
inference.py — CropRecommender class for production inference.

Loads the trained XGBoost model and LabelEncoder from the model/ directory,
validates inputs against agronomic bounds, and returns structured predictions.

Usage:
    from crop_recommendation.inference import CropRecommender

    recommender = CropRecommender()
    result = recommender.predict(
        nitrogen=90, phosphorus=42, potassium=43,
        temperature=20.87, humidity=82.0, ph=6.5, rainfall=202.93
    )
    # result = {
    #     "recommended_crop": "rice",
    #     "confidence": 0.95,
    #     "top_3_crops": [
    #         {"crop": "rice", "probability": 0.95},
    #         {"crop": "jute", "probability": 0.02},
    #         {"crop": "coconut", "probability": 0.01},
    #     ],
    #     "input_summary": { ... },
    #     "all_crops": ["apple", "banana", ...],
    # }
"""

import os
import pickle
import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths (relative to this file)
# ---------------------------------------------------------------------------
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_MODEL_PATH = os.path.join(_SCRIPT_DIR, "model", "crop_model.pkl")
_ENCODER_PATH = os.path.join(_SCRIPT_DIR, "model", "label_encoder.pkl")

# ---------------------------------------------------------------------------
# Agronomic validation bounds
# ---------------------------------------------------------------------------
# These ranges are generous enough to accept unusual-but-valid measurements
# while catching clearly erroneous inputs (e.g. pH = 99, temperature = 500).
PARAM_BOUNDS: dict[str, tuple[float, float]] = {
    "nitrogen":    (0,   300),    # kg/ha — common range 0–140, allow up to 300
    "phosphorus":  (0,   200),    # kg/ha — common range 5–145
    "potassium":   (0,   300),    # kg/ha — common range 5–205
    "temperature": (-10,  60),    # °C — extreme cold to extreme heat
    "humidity":    (0,   100),    # % relative humidity
    "ph":          (0,    14),    # soil pH scale
    "rainfall":    (0,  5000),    # mm — allows monsoon-heavy regions
}


class CropRecommenderError(Exception):
    """Raised when input validation fails."""
    pass


class CropRecommender:
    """Singleton-style crop recommendation engine backed by XGBoost.

    Thread-safe for read-only inference (no state mutation after __init__).
    """

    def __init__(
        self,
        model_path: str = _MODEL_PATH,
        encoder_path: str = _ENCODER_PATH,
    ):
        if not os.path.isfile(model_path):
            raise FileNotFoundError(
                f"Model file not found: {model_path}. "
                "Run train_model.py first to generate model artifacts."
            )
        if not os.path.isfile(encoder_path):
            raise FileNotFoundError(
                f"Label encoder not found: {encoder_path}. "
                "Run train_model.py first to generate model artifacts."
            )

        with open(model_path, "rb") as f:
            self._model = pickle.load(f)
        with open(encoder_path, "rb") as f:
            self._encoder = pickle.load(f)

        self._all_crops: list[str] = sorted(self._encoder.classes_.tolist())
        logger.info(
            "CropRecommender loaded: %d crops, model=%s",
            len(self._all_crops), model_path,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def supported_crops(self) -> list[str]:
        """List of all crop names the model can recommend."""
        return list(self._all_crops)

    def validate_inputs(
        self,
        nitrogen: float,
        phosphorus: float,
        potassium: float,
        temperature: float,
        humidity: float,
        ph: float,
        rainfall: float,
    ) -> list[str]:
        """Validate inputs and return a list of error messages (empty = valid)."""
        errors: list[str] = []
        params = {
            "nitrogen": nitrogen,
            "phosphorus": phosphorus,
            "potassium": potassium,
            "temperature": temperature,
            "humidity": humidity,
            "ph": ph,
            "rainfall": rainfall,
        }
        for name, value in params.items():
            if value is None:
                errors.append(f"{name} is required but was not provided.")
                continue
            try:
                val = float(value)
            except (TypeError, ValueError):
                errors.append(f"{name} must be a number, got: {value!r}")
                continue
            lo, hi = PARAM_BOUNDS[name]
            if val < lo or val > hi:
                errors.append(
                    f"{name}={val} is out of valid range [{lo}, {hi}]."
                )
        return errors

    def predict(
        self,
        nitrogen: float,
        phosphorus: float,
        potassium: float,
        temperature: float,
        humidity: float,
        ph: float,
        rainfall: float,
        *,
        top_k: int = 3,
    ) -> dict[str, Any]:
        """Run crop recommendation inference.

        Args:
            nitrogen:    Soil nitrogen content (kg/ha).
            phosphorus:  Soil phosphorus content (kg/ha).
            potassium:   Soil potassium content (kg/ha).
            temperature: Average temperature (°C).
            humidity:    Relative humidity (%).
            ph:          Soil pH value.
            rainfall:    Annual/seasonal rainfall (mm).
            top_k:       Number of top predictions to return.

        Returns:
            Dict with keys:
                recommended_crop  (str):  Best crop name.
                confidence        (float): Probability of the top crop.
                top_3_crops       (list):  Top-k crops with probabilities.
                input_summary     (dict):  Echo of validated inputs.
                all_crops         (list):  All 22 supported crop names.

        Raises:
            CropRecommenderError: If any input fails validation.
        """
        # 1. Validate
        errors = self.validate_inputs(
            nitrogen, phosphorus, potassium,
            temperature, humidity, ph, rainfall,
        )
        if errors:
            raise CropRecommenderError(
                "Input validation failed: " + "; ".join(errors)
            )

        # 2. Build feature array (must match training column order)
        features = np.array([[
            float(nitrogen),
            float(phosphorus),
            float(potassium),
            float(temperature),
            float(humidity),
            float(ph),
            float(rainfall),
        ]])

        # 3. Predict
        pred_idx = int(self._model.predict(features)[0])
        probabilities = self._model.predict_proba(features)[0]

        recommended_crop = self._encoder.inverse_transform([pred_idx])[0]
        confidence = float(probabilities[pred_idx])

        # 4. Build top-k list
        top_indices = np.argsort(probabilities)[::-1][:top_k]
        top_crops = []
        for idx in top_indices:
            crop_name = self._encoder.inverse_transform([idx])[0]
            prob = float(probabilities[idx])
            top_crops.append({"crop": crop_name, "probability": round(prob, 4)})

        # 5. Assemble response
        return {
            "recommended_crop": recommended_crop,
            "confidence": round(confidence, 4),
            "top_3_crops": top_crops,
            "input_summary": {
                "nitrogen": float(nitrogen),
                "phosphorus": float(phosphorus),
                "potassium": float(potassium),
                "temperature": float(temperature),
                "humidity": float(humidity),
                "ph": float(ph),
                "rainfall": float(rainfall),
            },
            "all_crops": self._all_crops,
        }
