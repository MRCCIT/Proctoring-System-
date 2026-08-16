from __future__ import annotations

from typing import Any


def _score(detection: Any) -> float:
    scores = getattr(detection, "score", None) or []
    return float(scores[0]) if scores else 0.0


def _box(detection: Any) -> tuple[float, float, float, float]:
    relative = detection.location_data.relative_bounding_box
    x1 = max(0.0, float(relative.xmin))
    y1 = max(0.0, float(relative.ymin))
    x2 = min(1.0, x1 + max(0.0, float(relative.width)))
    y2 = min(1.0, y1 + max(0.0, float(relative.height)))
    return x1, y1, x2, y2


def _intersection(a: tuple[float, ...], b: tuple[float, ...]) -> float:
    width = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    height = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return width * height


def _area(box: tuple[float, ...]) -> float:
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _same_face(a: tuple[float, ...], b: tuple[float, ...], iou_threshold: float) -> bool:
    intersection = _intersection(a, b)
    if intersection <= 0:
        return False
    area_a = _area(a)
    area_b = _area(b)
    union = area_a + area_b - intersection
    iou = intersection / max(union, 1e-8)
    contained = intersection / max(min(area_a, area_b), 1e-8)
    return iou >= iou_threshold or contained >= 0.70


def filter_face_detections(
    detections: list[Any],
    *,
    min_confidence: float,
    min_area_ratio: float,
    nms_iou: float,
) -> list[Any]:
    """Remove weak/tiny detections and overlapping boxes for the same face."""
    candidates = [
        detection
        for detection in detections
        if _score(detection) >= min_confidence and _area(_box(detection)) >= min_area_ratio
    ]
    accepted: list[Any] = []
    accepted_boxes: list[tuple[float, float, float, float]] = []
    for detection in sorted(candidates, key=_score, reverse=True):
        box = _box(detection)
        if any(_same_face(box, other, nms_iou) for other in accepted_boxes):
            continue
        accepted.append(detection)
        accepted_boxes.append(box)
    return accepted
