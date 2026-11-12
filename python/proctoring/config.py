"""Local defaults mirroring Inhouse-proc proctoring/config.py; override via env."""

from __future__ import annotations

import os
from pathlib import Path

# python/proctoring/config.py -> python/
ROOT_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = Path(os.getenv("PROCTORSHIELD_MODELS_DIR", str(ROOT_DIR / "models")))

SIDEWAYS_THRESHOLD = float(os.getenv("SIDEWAYS_THRESHOLD", "0.36"))
FACE_MODEL_SELECTION = int(os.getenv("FACE_MODEL_SELECTION", "0"))
FACE_MIN_DETECTION_CONFIDENCE = float(os.getenv("FACE_MIN_DETECTION_CONFIDENCE", "0.65"))
FACE_MIN_BOX_AREA_RATIO = float(os.getenv("FACE_MIN_BOX_AREA_RATIO", "0.02"))
FACE_NMS_IOU = float(os.getenv("FACE_NMS_IOU", "0.45"))
MULTIPLE_FACES_STREAK_THRESHOLD = int(os.getenv("MULTIPLE_FACES_STREAK_THRESHOLD", "2"))
EYE_GAZE_CENTER_MIN = float(os.getenv("EYE_GAZE_CENTER_MIN", "0.34"))
EYE_GAZE_CENTER_MAX = float(os.getenv("EYE_GAZE_CENTER_MAX", "0.66"))
EYE_GAZE_RETINANET_CONFIDENCE = float(os.getenv("EYE_GAZE_RETINANET_CONFIDENCE", "0.55"))
EYE_GAZE_RETINANET_MODEL_PATH = os.getenv(
    "GAZE_MODEL_PATH",
    str(MODELS_DIR / "retinanet_eye_gaze.pt"),
)

PHONE_DETECTOR_MODEL_PATH = os.getenv(
    "YOLO_MODEL_PATH",
    str(MODELS_DIR / "yolo11n.pt"),
)
PHONE_DETECTOR_CONFIDENCE = float(os.getenv("PHONE_DETECTOR_CONFIDENCE", "0.08"))
PHONE_DETECTOR_IOU = float(os.getenv("PHONE_DETECTOR_IOU", "0.45"))
# Higher imgsz catches briefly-shown / distant phones (was 256).
PHONE_DETECTOR_IMAGE_SIZE = int(os.getenv("PHONE_DETECTOR_IMAGE_SIZE", "416"))
PHONE_DETECTOR_FRAME_SKIP = int(os.getenv("PHONE_DETECTOR_FRAME_SKIP", "1"))
IDENTITY_EVERY_N_TICKS = int(os.getenv("IDENTITY_EVERY_N_TICKS", "3"))
PHONE_DETECTOR_MAX_DIM = int(os.getenv("PHONE_DETECTOR_MAX_DIM", "960"))
ELECTRONICS_DETECTOR_MODEL_PATH = os.getenv(
    "ELECTRONICS_YOLO_MODEL_PATH",
    str(MODELS_DIR / "electronics_yolo.pt"),
)
ELECTRONICS_DETECTOR_CONFIDENCE = float(os.getenv("ELECTRONICS_DETECTOR_CONFIDENCE", "0.50"))
ELECTRONICS_DETECTOR_IOU = float(os.getenv("ELECTRONICS_DETECTOR_IOU", "0.45"))
ELECTRONICS_DETECTOR_IMAGE_SIZE = int(os.getenv("ELECTRONICS_DETECTOR_IMAGE_SIZE", "320"))
ELECTRONICS_DETECTOR_FRAME_SKIP = int(os.getenv("ELECTRONICS_DETECTOR_FRAME_SKIP", "5"))
ELECTRONICS_DETECTOR_MAX_DIM = int(os.getenv("ELECTRONICS_DETECTOR_MAX_DIM", "640"))
ELECTRONICS_VISIBLE_STREAK_THRESHOLD = int(os.getenv("ELECTRONICS_VISIBLE_STREAK_THRESHOLD", "2"))
# Exclude phone-only class names: the dedicated COCO phone model owns that alert.
ELECTRONICS_DETECTOR_LABEL_TOKENS = tuple(
    token.strip().lower()
    for token in os.getenv("ELECTRONICS_DETECTOR_LABEL_TOKENS", "tablet,ipad").split(",")
    if token.strip()
)
# Keep enough width so briefly-shown phones remain detectable after resize.
INFERENCE_MAX_WIDTH = int(os.getenv("INFERENCE_MAX_WIDTH", "640"))
DEEP_GAZE_EVERY_N_TICKS = int(os.getenv("DEEP_GAZE_EVERY_N_TICKS", "2"))

LOW_LIGHT_MEAN_THRESHOLD = float(os.getenv("LOW_LIGHT_MEAN_THRESHOLD", "60.0"))
PHONE_VISIBLE_STREAK_THRESHOLD = int(os.getenv("PHONE_VISIBLE_STREAK_THRESHOLD", "1"))
# ArcFace: similarity is 0–100 in API responses; distance threshold is 0–1 (cosine distance).
# 0.20 ≈ 60% cosine similarity — stricter than 0.28 (~44%), reduces false accepts for different people.
ARCFACE_DISTANCE_THRESHOLD = float(os.getenv("ARCFACE_DISTANCE_THRESHOLD", "0.20"))
LIVE_MATCH_MIN_SIMILARITY = float(os.getenv("LIVE_MATCH_MIN_SIMILARITY", "62"))
# Legacy name — values <= 1 treated as 0–1 cosine; > 1 as percent similarity.
LIVE_MATCH_THRESHOLD = float(os.getenv("LIVE_MATCH_THRESHOLD", str(LIVE_MATCH_MIN_SIMILARITY)))
LIVE_IDENTITY_MISMATCH_STREAK_THRESHOLD = int(os.getenv("LIVE_IDENTITY_MISMATCH_STREAK_THRESHOLD", "2"))
