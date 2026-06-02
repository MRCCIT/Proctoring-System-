"""Downscale frames before inference to cut latency on the AI sidecar."""

from __future__ import annotations

import cv2
import numpy as np

from proctoring.config import INFERENCE_MAX_WIDTH


def resize_for_inference(frame_bgr: np.ndarray, max_width: int = INFERENCE_MAX_WIDTH) -> np.ndarray:
    h, w = frame_bgr.shape[:2]
    if w <= max_width:
        return frame_bgr
    scale = max_width / float(w)
    nh = max(1, int(round(h * scale)))
    return cv2.resize(frame_bgr, (max_width, nh), interpolation=cv2.INTER_AREA)
