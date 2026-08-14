import cv2
try:
    import mediapipe as mp
    _mp_solutions = getattr(mp, "solutions", None)
    if _mp_solutions is None:
        # Some mediapipe installations may not expose `solutions` on the top-level
        # namespace; try importing the submodule directly.
        import mediapipe.solutions as _mp_solutions
except Exception:
    _mp_solutions = None
import numpy as np
import logging

from proctoring.config import (
    EYE_GAZE_CENTER_MAX,
    EYE_GAZE_CENTER_MIN,
    EYE_GAZE_RETINANET_CONFIDENCE,
    EYE_GAZE_RETINANET_MODEL_PATH,
    SIDEWAYS_THRESHOLD,
)
from proctoring.domain.models import AnalysisResult
from proctoring.services.gaze import EyeGazeDetector


class ProctorAnalyzer:
    def __init__(self) -> None:
        self.logger = logging.getLogger(__name__)

        # Always initialize the eye-gaze detector (it may work without mediapipe).
        self.eye_gaze_detector = EyeGazeDetector(
            model_path=EYE_GAZE_RETINANET_MODEL_PATH,
            confidence=EYE_GAZE_RETINANET_CONFIDENCE,
            center_min=EYE_GAZE_CENTER_MIN,
            center_max=EYE_GAZE_CENTER_MAX,
        )

        # If mediapipe isn't available, operate in degraded mode: no face
        # detection/mesh will be available, but gaze detector can still try.
        if _mp_solutions is None:
            self.logger.warning(
                "mediapipe.solutions not available — running in degraded mode (face detection disabled)"
            )
            self.face_detection = None
            self.face_mesh = None
            self.sideways_threshold = SIDEWAYS_THRESHOLD
            return

        self.face_detection = _mp_solutions.face_detection.FaceDetection(
            model_selection=1,
            min_detection_confidence=0.5,
        )
        self.face_mesh = _mp_solutions.face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.sideways_threshold = SIDEWAYS_THRESHOLD

    def analyze(self, frame_bgr: np.ndarray, *, deep_gaze: bool = True) -> AnalysisResult:
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        # If mediapipe face detector is not available, fall back to gaze-only analysis.
        if self.face_detection is None:
            gaze_result = self.eye_gaze_detector.analyze(frame_bgr, deep=deep_gaze)
            violations: list[str] = ["mediapipe_unavailable"]
            return AnalysisResult(
                face_count=1 if gaze_result else 0,
                sideways_score=None,
                violations=violations,
                gaze_direction=gaze_result.direction if gaze_result else None,
                gaze_score=gaze_result.score if gaze_result else None,
                gaze_detector=gaze_result.detector if gaze_result else None,
            )

        detections = self.face_detection.process(frame_rgb).detections or []
        face_count = len(detections)

        violations: list[str] = []
        if face_count == 0:
            violations.append("no_face_detected")
            return AnalysisResult(face_count=0, sideways_score=None, violations=violations)

        if face_count > 1:
            violations.append("multiple_faces_detected")
            return AnalysisResult(face_count=face_count, sideways_score=None, violations=violations)

        mesh_result = self.face_mesh.process(frame_rgb)
        if not mesh_result.multi_face_landmarks:
            gaze_result = self.eye_gaze_detector.analyze(frame_bgr, deep=deep_gaze)
            return AnalysisResult(
                face_count=1,
                sideways_score=None,
                violations=violations,
                gaze_direction=gaze_result.direction if gaze_result else None,
                gaze_score=gaze_result.score if gaze_result else None,
                gaze_detector=gaze_result.detector if gaze_result else None,
            )

        landmarks = mesh_result.multi_face_landmarks[0].landmark
        left_eye_outer = landmarks[33]
        right_eye_outer = landmarks[263]
        nose_tip = landmarks[1]

        eye_mid_x = (left_eye_outer.x + right_eye_outer.x) / 2.0
        half_eye_dist = max(abs(right_eye_outer.x - left_eye_outer.x) / 2.0, 1e-6)
        sideways_score = (nose_tip.x - eye_mid_x) / half_eye_dist

        if abs(sideways_score) > self.sideways_threshold:
            violations.append("looking_sideways")

        gaze_result = self.eye_gaze_detector.analyze(frame_bgr, landmarks, deep=deep_gaze)

        return AnalysisResult(
            face_count=1,
            sideways_score=float(sideways_score),
            violations=violations,
            gaze_direction=gaze_result.direction if gaze_result else None,
            gaze_score=gaze_result.score if gaze_result else None,
            gaze_detector=gaze_result.detector if gaze_result else None,
        )
