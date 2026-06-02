import cv2
import mediapipe as mp
import numpy as np

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
        self.face_detection = mp.solutions.face_detection.FaceDetection(
            model_selection=0,
            min_detection_confidence=0.6,
        )
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.sideways_threshold = SIDEWAYS_THRESHOLD
        self.eye_gaze_detector = EyeGazeDetector(
            model_path=EYE_GAZE_RETINANET_MODEL_PATH,
            confidence=EYE_GAZE_RETINANET_CONFIDENCE,
            center_min=EYE_GAZE_CENTER_MIN,
            center_max=EYE_GAZE_CENTER_MAX,
        )

    def analyze(self, frame_bgr: np.ndarray, *, deep_gaze: bool = True) -> AnalysisResult:
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        detections = self.face_detection.process(frame_rgb).detections or []
        face_count = len(detections)

        violations: list[str] = []
        if face_count == 0:
            violations.append("no_face")
            return AnalysisResult(face_count=0, sideways_score=None, violations=violations)

        if face_count > 1:
            violations.append("multiple_faces")
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
