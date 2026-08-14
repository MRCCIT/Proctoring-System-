from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)


@dataclass
class GazeResult:
    direction: str
    score: float
    away: bool
    detector: str


class EyeGazeDetector:
    def __init__(
        self,
        model_path: str,
        confidence: float,
        center_min: float,
        center_max: float,
    ) -> None:
        self.model_path = str(model_path)
        self.confidence = float(confidence)
        self.center_min = float(center_min)
        self.center_max = float(center_max)
        self._model: Any = None
        self._torch: Any = None
        self._retinanet_enabled = False
        self._label_map = {
            0: "center",
            1: "center",
            2: "left",
            3: "right",
            4: "up",
            5: "down",
            6: "closed",
            7: "away",
        }
        self._load_retinanet_model()

    @property
    def enabled(self) -> bool:
        return True

    @property
    def retinanet_enabled(self) -> bool:
        return self._retinanet_enabled

    def analyze(
        self,
        frame_bgr: np.ndarray,
        landmarks: Any | None = None,
        *,
        deep: bool = True,
    ) -> GazeResult | None:
        if deep:
            retinanet_result = self._analyze_with_retinanet(frame_bgr)
            if retinanet_result is not None:
                return retinanet_result
        if landmarks is None:
            return None
        return self._analyze_with_landmarks(landmarks)

    def _load_retinanet_model(self) -> None:
        path = Path(self.model_path)
        if not path.exists():
            return

        try:
            import torch

            self._torch = torch
            try:
                self._model = torch.jit.load(str(path), map_location="cpu")
            except Exception:
                try:
                    checkpoint = torch.load(str(path), map_location="cpu")
                except Exception:
                    logger.exception("Failed to load retinanet checkpoint from %s", str(path))
                    raise
                if hasattr(checkpoint, "eval"):
                    self._model = checkpoint
                elif isinstance(checkpoint, dict) and hasattr(checkpoint.get("model"), "eval"):
                    self._model = checkpoint["model"]
                elif isinstance(checkpoint, dict):
                    self._model = self._build_retinanet_from_checkpoint(checkpoint)

            if self._model is not None:
                self._model.eval()
                self._retinanet_enabled = True
        except Exception:
            logger.exception("RetinaNet model load failed for %s", str(path))
            self._model = None
            self._retinanet_enabled = False

    def _build_retinanet_from_checkpoint(self, checkpoint: dict[str, Any]) -> Any | None:
        try:
            import torchvision

            state_dict = checkpoint.get("state_dict", checkpoint)
            num_classes = max(self._label_map.keys()) + 1
            model = torchvision.models.detection.retinanet_resnet50_fpn(
                weights=None,
                weights_backbone=None,
                num_classes=num_classes,
            )
            model.load_state_dict(state_dict, strict=False)
            return model
        except Exception:
            logger.exception("Failed to build RetinaNet from checkpoint")
            return None

    def _analyze_with_retinanet(self, frame_bgr: np.ndarray) -> GazeResult | None:
        if self._model is None or self._torch is None:
            return None

        try:
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            tensor = self._torch.from_numpy(frame_rgb).permute(2, 0, 1).float() / 255.0
            with self._torch.no_grad():
                output = self._model([tensor])
            if isinstance(output, tuple):
                output = output[0]
            if isinstance(output, list):
                output = output[0] if output else None
            if not isinstance(output, dict):
                return None

            labels = output.get("labels")
            scores = output.get("scores")
            if labels is None or scores is None or len(scores) == 0:
                return None

            scores_np = scores.detach().cpu().numpy()
            labels_np = labels.detach().cpu().numpy()
            valid = np.where(scores_np >= self.confidence)[0]
            if len(valid) == 0:
                return None

            best_idx = int(valid[np.argmax(scores_np[valid])])
            label_id = int(labels_np[best_idx])
            direction = self._label_map.get(label_id, "away")
            score = float(scores_np[best_idx])
            away = direction not in {"center", "forward"}
            return GazeResult(direction=direction, score=score, away=away, detector="retinanet")
        except Exception:
            logger.exception("RetinaNet analysis failed")
            return None

    def _analyze_with_landmarks(self, landmarks: Any) -> GazeResult | None:
        if len(landmarks) < 478:
            return None

        left_ratio = self._horizontal_iris_ratio(landmarks, outer_idx=33, inner_idx=133, iris_idxs=(468, 469, 470, 471, 472))
        right_ratio = self._horizontal_iris_ratio(landmarks, outer_idx=263, inner_idx=362, iris_idxs=(473, 474, 475, 476, 477))
        ratios = [ratio for ratio in (left_ratio, right_ratio) if ratio is not None]
        if not ratios:
            return None

        gaze_ratio = float(np.mean(ratios))
        if gaze_ratio < self.center_min:
            direction = "left"
        elif gaze_ratio > self.center_max:
            direction = "right"
        else:
            direction = "center"

        return GazeResult(
            direction=direction,
            score=float(abs(gaze_ratio - 0.5) * 2.0),
            away=direction != "center",
            detector="landmarks",
        )

    @staticmethod
    def _horizontal_iris_ratio(
        landmarks: Any,
        outer_idx: int,
        inner_idx: int,
        iris_idxs: tuple[int, ...],
    ) -> float | None:
        eye_xs = [float(landmarks[outer_idx].x), float(landmarks[inner_idx].x)]
        min_x = min(eye_xs)
        max_x = max(eye_xs)
        width = max(max_x - min_x, 1e-6)
        iris_x = float(np.mean([float(landmarks[idx].x) for idx in iris_idxs]))
        return (iris_x - min_x) / width
