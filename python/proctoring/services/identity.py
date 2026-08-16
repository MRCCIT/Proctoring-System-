from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

from proctoring.domain.models import RegisteredUser
from proctoring.config import (
    FACE_MIN_BOX_AREA_RATIO,
    FACE_MIN_DETECTION_CONFIDENCE,
    FACE_NMS_IOU,
)
from proctoring.services.face_detections import filter_face_detections

try:
    from ultralytics import YOLO
except ImportError:  # pragma: no cover - optional runtime dependency.
    YOLO = None
    logger.warning("ultralytics.YOLO not available; YOLO detectors disabled")


def decode_data_url_image(data_url: str) -> np.ndarray:
    if not data_url or "," not in data_url:
        raise ValueError("Invalid image payload")

    encoded = data_url.split(",", 1)[1]
    img_bytes = base64.b64decode(encoded)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        logger.debug("Failed to decode image: %d bytes", len(img_bytes))
        raise ValueError(f"Could not decode frame (decoded {len(img_bytes)} bytes)")
    return frame


def decode_payload_frame(payload: dict[str, Any], key: str = "image") -> np.ndarray:
    return decode_data_url_image(str(payload.get(key, "")))


def collect_registration_image_payloads(payload: dict[str, Any]) -> list[str]:
    image_data = payload.get("image", "")
    images_data = payload.get("images")

    if isinstance(images_data, list):
        return [str(item) for item in images_data if isinstance(item, str)]
    if isinstance(image_data, str) and image_data:
        return [image_data]
    return []


def _clip_bbox(
    x: int,
    y: int,
    w: int,
    h: int,
    frame_w: int,
    frame_h: int,
    pad_ratio: float = 0.2,
) -> tuple[int, int, int, int]:
    pad_x = int(w * pad_ratio)
    pad_y = int(h * pad_ratio)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(frame_w, x + w + pad_x)
    y2 = min(frame_h, y + h + pad_y)
    return x1, y1, x2, y2


def extract_single_face_crop(face_detection: Any, frame_bgr: np.ndarray) -> np.ndarray:
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    detections = filter_face_detections(
        face_detection.process(frame_rgb).detections or [],
        min_confidence=FACE_MIN_DETECTION_CONFIDENCE,
        min_area_ratio=FACE_MIN_BOX_AREA_RATIO,
        nms_iou=FACE_NMS_IOU,
    )

    if len(detections) == 0:
        raise ValueError("No face detected")
    if len(detections) > 1:
        raise ValueError("Multiple faces detected")

    det = detections[0]
    bbox = det.location_data.relative_bounding_box
    frame_h, frame_w = frame_bgr.shape[:2]

    x = int(bbox.xmin * frame_w)
    y = int(bbox.ymin * frame_h)
    w = int(bbox.width * frame_w)
    h = int(bbox.height * frame_h)
    x1, y1, x2, y2 = _clip_bbox(x, y, w, h, frame_w, frame_h)

    face_crop = frame_bgr[y1:y2, x1:x2]
    if face_crop.size == 0:
        raise ValueError("Face crop failed")
    return face_crop


def get_single_face_area_ratio(face_detection: Any, frame_bgr: np.ndarray) -> float:
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    detections = filter_face_detections(
        face_detection.process(frame_rgb).detections or [],
        min_confidence=FACE_MIN_DETECTION_CONFIDENCE,
        min_area_ratio=FACE_MIN_BOX_AREA_RATIO,
        nms_iou=FACE_NMS_IOU,
    )
    if len(detections) == 0:
        raise ValueError("No face detected")
    if len(detections) > 1:
        raise ValueError("Multiple faces detected")

    det = detections[0]
    bbox = det.location_data.relative_bounding_box
    frame_h, frame_w = frame_bgr.shape[:2]

    x = int(bbox.xmin * frame_w)
    y = int(bbox.ymin * frame_h)
    w = int(bbox.width * frame_w)
    h = int(bbox.height * frame_h)
    x1, y1, x2, y2 = _clip_bbox(x, y, w, h, frame_w, frame_h)

    face_area = max(0, x2 - x1) * max(0, y2 - y1)
    frame_area = max(1, frame_h * frame_w)
    return float(face_area / frame_area)


def is_face_close_enough(face_detection: Any, frame_bgr: np.ndarray, min_area_ratio: float) -> bool:
    area_ratio = get_single_face_area_ratio(face_detection, frame_bgr)
    return area_ratio >= float(min_area_ratio)


def compute_face_signature(face_crop_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY)
    normalized = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)

    hist = cv2.calcHist([normalized], [0], None, [32], [0, 256]).flatten()
    hist = hist / (np.linalg.norm(hist) + 1e-8)

    patch = cv2.resize(normalized, (24, 24), interpolation=cv2.INTER_AREA).astype(np.float32)
    patch = patch.flatten()
    patch = (patch - patch.mean()) / (patch.std() + 1e-8)
    patch = patch / (np.linalg.norm(patch) + 1e-8)

    signature = np.concatenate([hist, patch])
    signature = signature / (np.linalg.norm(signature) + 1e-8)
    return signature.astype(np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)


def verify_identity_for_user(
    registered_faces: dict[str, RegisteredUser],
    face_detection: Any,
    username: str,
    frame_bgr: np.ndarray,
    threshold: float,
) -> tuple[bool, float]:
    user = registered_faces.get(username.lower())
    if user is None:
        raise ValueError("User is not registered")

    face_crop = extract_single_face_crop(face_detection, frame_bgr)
    signature = compute_face_signature(face_crop)
    best_score = max(cosine_similarity(signature, reference) for reference in user.signatures)
    return best_score >= threshold, best_score


def estimate_frame_brightness(frame_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


class PhoneDetector:
    def __init__(
        self,
        model_path: str,
        confidence: float,
        iou: float,
        image_size: int,
        frame_skip: int,
        max_dim: int,
    ) -> None:
        self._confidence = float(confidence)
        self._iou = float(iou)
        self._image_size = int(image_size)
        self._frame_skip = max(1, int(frame_skip))
        self._max_dim = max(160, int(max_dim))
        self._frame_counter = 0
        self._last_detected = False
        self._last_infer_frame = 0
        self._persist_frames = max(1, self._frame_skip - 1)
        self._class_ids: list[int] | None = None

        self.enabled = YOLO is not None
        self._model = None
        if self.enabled:
            try:
                self._model = YOLO(model_path)
                self._class_ids = self._resolve_phone_class_ids()
            except Exception:
                logger.exception("Failed to initialize PhoneDetector YOLO model: %s", model_path)
                self._model = None
                self.enabled = False
                self._class_ids = None

    def detect_phone(self, frame_bgr: np.ndarray) -> bool:
        self._frame_counter += 1
        should_infer = self._frame_counter == 1 or (self._frame_counter % self._frame_skip == 0)

        if not self.enabled or self._model is None:
            return detect_phone_like_object(frame_bgr)

        if not should_infer:
            if self._last_detected and (self._frame_counter - self._last_infer_frame) <= self._persist_frames:
                return True
            return False

        infer_frame = self._prepare_frame(frame_bgr)
        try:
            results = self._model.predict(
                source=infer_frame,
                conf=self._confidence,
                iou=self._iou,
                imgsz=self._image_size,
                classes=self._class_ids,
                verbose=False,
            )
        except Exception:
            logger.exception("PhoneDetector predict failed")
            self._last_detected = detect_phone_like_object(frame_bgr)
            self._last_infer_frame = self._frame_counter
            return self._last_detected

        detected = False
        if results:
            boxes = results[0].boxes
            detected = bool(boxes is not None and len(boxes) > 0)

        self._last_detected = detected
        self._last_infer_frame = self._frame_counter
        return detected

    def _resolve_phone_class_ids(self) -> list[int] | None:
        if self._model is None:
            return None
        names = getattr(self._model, "names", None)
        if not isinstance(names, dict):
            return None

        tokens = ("cell phone", "mobile phone", "phone", "mobile")
        class_ids: list[int] = []
        for class_id, raw_name in names.items():
            label = str(raw_name).strip().lower()
            if any(token in label for token in tokens):
                try:
                    class_ids.append(int(class_id))
                except (TypeError, ValueError):
                    continue

        return class_ids or None

    def _prepare_frame(self, frame_bgr: np.ndarray) -> np.ndarray:
        frame_h, frame_w = frame_bgr.shape[:2]
        current_max_dim = max(frame_h, frame_w)
        if current_max_dim <= self._max_dim:
            return frame_bgr
        scale = self._max_dim / float(current_max_dim)
        target_w = max(1, int(frame_w * scale))
        target_h = max(1, int(frame_h * scale))
        return cv2.resize(frame_bgr, (target_w, target_h), interpolation=cv2.INTER_AREA)


class ElectronicsDetector:
    """YOLO detector for the custom, labeled prohibited-electronics model.

    The detector deliberately has no geometry-based fallback: a missing or invalid
    custom model must not create electronics violations from unreliable guesses.
    """

    def __init__(
        self,
        model_path: str,
        confidence: float,
        iou: float,
        image_size: int,
        frame_skip: int,
        max_dim: int,
        label_tokens: tuple[str, ...],
    ) -> None:
        self._confidence = float(confidence)
        self._iou = float(iou)
        self._image_size = int(image_size)
        self._frame_skip = max(1, int(frame_skip))
        self._max_dim = max(160, int(max_dim))
        self._frame_counter = 0
        self._label_tokens = tuple(token.lower() for token in label_tokens)
        self._last_detection: dict[str, Any] = {"detected": False, "labels": [], "fresh": False}
        self.enabled = YOLO is not None
        self._model = None
        if self.enabled and Path(model_path).is_file():
            try:
                self._model = YOLO(model_path)
            except Exception:
                logger.exception("Failed to initialize ElectronicsDetector YOLO model: %s", model_path)
                self._model = None
                self.enabled = False
        elif self.enabled:
            self.enabled = False

    def detect_electronics(self, frame_bgr: np.ndarray) -> dict[str, Any]:
        self._frame_counter += 1
        should_infer = self._frame_counter == 1 or self._frame_counter % self._frame_skip == 0
        if not self.enabled or self._model is None:
            return {"detected": False, "labels": [], "fresh": False}
        if not should_infer:
            return {**self._last_detection, "fresh": False}

        frame = self._prepare_frame(frame_bgr)
        try:
            results = self._model.predict(
                source=frame,
                conf=self._confidence,
                iou=self._iou,
                imgsz=self._image_size,
                verbose=False,
            )
        except Exception:
            logger.exception("ElectronicsDetector predict failed")
            self._last_detection = {"detected": False, "labels": [], "fresh": True}
            return dict(self._last_detection)

        labels: list[str] = []
        if results and results[0].boxes is not None:
            names = getattr(results[0], "names", {})
            for class_id in results[0].boxes.cls.tolist():
                label = str(names.get(int(class_id), class_id)) if isinstance(names, dict) else str(class_id)
                if self._is_electronics_label(label) and label not in labels:
                    labels.append(label)
        self._last_detection = {"detected": bool(labels), "labels": labels, "fresh": True}
        return dict(self._last_detection)

    def _is_electronics_label(self, label: str) -> bool:
        return any(token in label.lower() for token in self._label_tokens)

    def _prepare_frame(self, frame_bgr: np.ndarray) -> np.ndarray:
        frame_h, frame_w = frame_bgr.shape[:2]
        current_max_dim = max(frame_h, frame_w)
        if current_max_dim <= self._max_dim:
            return frame_bgr
        scale = self._max_dim / float(current_max_dim)
        return cv2.resize(
            frame_bgr,
            (max(1, int(frame_w * scale)), max(1, int(frame_h * scale))),
            interpolation=cv2.INTER_AREA,
        )


def detect_phone_like_object(frame_bgr: np.ndarray) -> bool:
    """
    Lightweight heuristic for phone-in-hand detection.
    Detects rectangular objects with phone-like geometry.
    Uses a small score-based check to improve recall for slightly tilted phones.
    """
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 55, 145)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=1)

    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours_edges, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours_thresh, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = contours_edges + contours_thresh

    frame_h, frame_w = frame_bgr.shape[:2]
    frame_area = float(frame_h * frame_w)

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < frame_area * 0.015:
            continue

        score = 0

        perimeter = cv2.arcLength(contour, True)
        if perimeter <= 0:
            continue

        approx = cv2.approxPolyDP(contour, 0.03 * perimeter, True)
        if 4 <= len(approx) <= 8:
            score += 1

        x, y, w, h = cv2.boundingRect(contour)
        if w <= 0 or h <= 0:
            continue

        aspect_ratio = w / float(h)
        normalized_ratio = aspect_ratio if aspect_ratio <= 1.0 else 1.0 / aspect_ratio
        if 0.35 <= normalized_ratio <= 0.72:
            score += 1

        rect = cv2.minAreaRect(contour)
        rect_w, rect_h = rect[1]
        if rect_w > 0 and rect_h > 0:
            rect_ratio = min(rect_w, rect_h) / (max(rect_w, rect_h) + 1e-8)
            if 0.35 <= rect_ratio <= 0.72:
                score += 1
            rect_area = rect_w * rect_h
            if rect_area > 0:
                extent = area / (rect_area + 1e-8)
                if extent >= 0.45:
                    score += 1

        # Phones often have stronger edge concentration inside a compact rectangle.
        x2 = min(frame_w, x + w)
        y2 = min(frame_h, y + h)
        touches_border = x <= 2 or y <= 2 or x2 >= (frame_w - 2) or y2 >= (frame_h - 2)
        if touches_border:
            continue
        roi_edges = edges[y:y2, x:x2]
        if roi_edges.size > 0:
            edge_density = float(np.count_nonzero(roi_edges)) / float(roi_edges.size)
            if edge_density >= 0.025:
                score += 1

        roi_gray = gray[y:y2, x:x2]
        if roi_gray.size > 0:
            # Many phones appear as relatively uniform planar regions.
            roi_std = float(np.std(roi_gray))
            if 8.0 <= roi_std <= 48.0:
                score += 1

        bbox_area = float(w * h)
        if frame_area * 0.02 <= bbox_area <= frame_area * 0.22:
            score += 1

        if score >= 4:
            return True

    return False
