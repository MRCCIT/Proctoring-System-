from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class AnalysisResult:
    face_count: int
    sideways_score: float | None
    violations: list[str]
    gaze_direction: str | None = None
    gaze_score: float | None = None
    gaze_detector: str | None = None


@dataclass
class RegisteredUser:
    username: str
    signatures: list[np.ndarray]
    first_name: str = ""
    last_name: str = ""
    email: str = ""
