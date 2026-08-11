"""
Unified per-frame proctoring (ported from reference backend analyze_frame flow).
Runs face + gaze + phone + optional identity in one decode pass.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from proctoring.config import (
    ELECTRONICS_VISIBLE_STREAK_THRESHOLD,
    LOW_LIGHT_MEAN_THRESHOLD,
    PHONE_VISIBLE_STREAK_THRESHOLD,
)
from proctoring.domain.models import AnalysisResult
from proctoring.services.analyzer import ProctorAnalyzer
from proctoring.services.identity import ElectronicsDetector, PhoneDetector, estimate_frame_brightness


def _gaze_violations(result: AnalysisResult) -> list[str]:
    extra: list[str] = []
    if result.gaze_direction and result.gaze_direction not in {"center", "forward"}:
        extra.append(f"gaze_{result.gaze_direction}")
    return extra


class SessionAnalyzer:
    def __init__(
        self,
        analyzer: ProctorAnalyzer,
        phone_detector: PhoneDetector,
        electronics_detector: ElectronicsDetector,
    ) -> None:
        self.analyzer = analyzer
        self.phone_detector = phone_detector
        self.electronics_detector = electronics_detector

    def analyze_frame_core(
        self,
        frame_bgr: np.ndarray,
        *,
        run_phone: bool = True,
        run_electronics: bool = True,
        deep_gaze: bool = True,
    ) -> dict[str, Any]:
        result = self.analyzer.analyze(frame_bgr, deep_gaze=deep_gaze)
        violations = list(result.violations) + _gaze_violations(result)
        brightness = estimate_frame_brightness(frame_bgr)
        if brightness < LOW_LIGHT_MEAN_THRESHOLD:
            violations.append("low_lighting")

        phone_detected = self.phone_detector.detect_phone(frame_bgr) if run_phone else False
        electronics = self.electronics_detector.detect_electronics(frame_bgr) if run_electronics else {"detected": False, "labels": []}

        return {
            "face_count": result.face_count,
            "sideways_score": result.sideways_score,
            "violations": violations,
            "gaze_direction": result.gaze_direction,
            "gaze_score": result.gaze_score,
            "gaze_detector": result.gaze_detector,
            "brightness": brightness,
            "phone_detected": phone_detected,
            "phone_yolo_enabled": self.phone_detector.enabled,
            "electronics_detected": bool(electronics["detected"]),
            "electronics_labels": electronics["labels"],
            "electronics_yolo_enabled": self.electronics_detector.enabled,
        }

    def apply_phone_streak(
        self,
        phone_detected: bool,
        phone_streak: int,
        phone_active: bool,
    ) -> tuple[list[str], int, bool]:
        streak = phone_streak + 1 if phone_detected else 0
        active = phone_active
        flagged: list[str] = []
        if phone_detected and streak >= PHONE_VISIBLE_STREAK_THRESHOLD and not active:
            flagged.append("phone_visible")
            active = True
        if not phone_detected:
            active = False
        return flagged, streak, active

    def apply_electronics_streak(
        self, electronics_detected: bool, electronics_streak: int, electronics_active: bool
    ) -> tuple[list[str], int, bool]:
        streak = electronics_streak + 1 if electronics_detected else 0
        active = electronics_active
        flagged: list[str] = []
        if electronics_detected and streak >= ELECTRONICS_VISIBLE_STREAK_THRESHOLD and not active:
            flagged.append("electronics_visible")
            active = True
        if not electronics_detected:
            active = False
        return flagged, streak, active
