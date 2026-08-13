"""Run two YOLO models on images and alert if the second model detects any classes.

Usage examples (from python/):
  python training/infer_both_models.py --model1 models/yolo11n.pt --model2 runs/electronics/best.pt --image data/electronics/valid/images/0001.jpg
  python training/infer_both_models.py --model1 models/yolo11n.pt --model2 runs/electronics/best.pt --source data/electronics/valid/images --save-dir runs/inference_both

This script uses the `ultralytics` package for loading and running YOLO models.
It will print detected class names from both models and will save an annotated image
with an ALERT overlay if the second model produces any detections.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import List

import cv2
import numpy as np
from proctoring.config import (
    PHONE_DETECTOR_MODEL_PATH,
    PHONE_DETECTOR_CONFIDENCE,
    PHONE_DETECTOR_IOU,
    PHONE_DETECTOR_IMAGE_SIZE,
    PHONE_DETECTOR_FRAME_SKIP,
    PHONE_DETECTOR_MAX_DIM,
    ELECTRONICS_DETECTOR_MODEL_PATH,
    ELECTRONICS_DETECTOR_CONFIDENCE,
    ELECTRONICS_DETECTOR_IOU,
    ELECTRONICS_DETECTOR_IMAGE_SIZE,
    ELECTRONICS_DETECTOR_FRAME_SKIP,
    ELECTRONICS_DETECTOR_MAX_DIM,
)
from proctoring.services.identity import PhoneDetector, ElectronicsDetector
from proctoring.config import ELECTRONICS_DETECTOR_LABEL_TOKENS


def annotate_and_save_with_detectors(
    image: np.ndarray,
    phone_detector: PhoneDetector,
    electronics_detector: ElectronicsDetector,
    out_path: Path,
    alert: bool,
) -> None:
    img = image.copy()

    # Attempt to draw YOLO boxes when underlying models exist
    def draw_from_model(detector, colour=(0, 255, 0)):
        model = getattr(detector, "_model", None)
        if model is None:
            return
        try:
            results = model.predict(source=img, conf=detector._confidence, iou=detector._iou, imgsz=detector._image_size, verbose=False)
        except Exception:
            return
        if not results:
            return
        r = results[0]
        boxes = getattr(r, "boxes", None)
        if boxes is None:
            return
        xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes, "xyxy") else boxes.xyxy.numpy()
        cls_ids = boxes.cls.cpu().numpy().astype(int) if hasattr(boxes, "cls") else boxes.cls.numpy().astype(int)
        confs = boxes.conf.cpu().numpy() if hasattr(boxes, "conf") else boxes.conf.numpy()
        names = getattr(r, "names", {})
        for (x1, y1, x2, y2), cid, conf in zip(xyxy, cls_ids, confs):
            label = f"{names.get(int(cid), cid)}: {conf:.2f}" if isinstance(names, dict) else f"{cid}: {conf:.2f}"
            x1i, y1i, x2i, y2i = map(int, (x1, y1, x2, y2))
            cv2.rectangle(img, (x1i, y1i), (x2i, y2i), colour, 2)
            cv2.putText(img, label, (x1i, max(15, y1i - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 1)

    draw_from_model(phone_detector, (0, 255, 0))
    draw_from_model(electronics_detector, (0, 165, 255))

    if alert:
        h, w = img.shape[:2]
        overlay_text = "ALERT: ELECTRONICS DETECTED"
        cv2.rectangle(img, (0, 0), (w, 30), (0, 0, 255), -1)
        cv2.putText(img, overlay_text, (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), img)


def run_on_image(img_path: Path, phone_detector: PhoneDetector, electronics_detector: ElectronicsDetector, save_dir: Path) -> None:
    img_bgr = cv2.imread(str(img_path))
    if img_bgr is None:
        print(f"Failed to read image: {img_path}")
        return

    phone_detected = phone_detector.detect_phone(img_bgr) if phone_detector is not None else False
    electronics_res = electronics_detector.detect_electronics(img_bgr) if electronics_detector is not None else {"detected": False, "labels": []}

    tags1 = ["phone"] if phone_detected else []
    tags2 = list(electronics_res.get("labels", []))

    print(f"Image: {img_path}")
    print(f" Model1 tags: {sorted(set(tags1))}")
    print(f" Model2 tags: {sorted(set(tags2))}")

    alert = len(tags2) > 0
    out_name = img_path.stem + ("_alert.jpg" if alert else "_ok.jpg")
    out_path = save_dir / out_name
    annotate_and_save_with_detectors(img_bgr, phone_detector, electronics_detector, out_path, alert)
    if alert:
        print(f"*** ALERT: detections from second model saved to {out_path} ***")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run two YOLO models on images and alert on second-model detections.")
    parser.add_argument("--phone-model", help="Path for phone YOLO model; defaults to config")
    parser.add_argument("--electronics-model", help="Path for electronics YOLO model; defaults to config")
    parser.add_argument("--image", help="Single image path to run inference on")
    parser.add_argument("--source", help="Directory of images to run inference on")
    parser.add_argument("--save-dir", default="runs/inference_both", help="Where to save annotated outputs")
    args = parser.parse_args()

    if not args.image and not args.source:
        parser.error("Provide either --image or --source")

    phone_model = args.phone_model or PHONE_DETECTOR_MODEL_PATH
    electronics_model = args.electronics_model or ELECTRONICS_DETECTOR_MODEL_PATH

    phone_detector = PhoneDetector(
        model_path=phone_model,
        confidence=PHONE_DETECTOR_CONFIDENCE,
        iou=PHONE_DETECTOR_IOU,
        image_size=PHONE_DETECTOR_IMAGE_SIZE,
        frame_skip=PHONE_DETECTOR_FRAME_SKIP,
        max_dim=PHONE_DETECTOR_MAX_DIM,
    )

    electronics_detector = ElectronicsDetector(
        model_path=electronics_model,
        confidence=ELECTRONICS_DETECTOR_CONFIDENCE,
        iou=ELECTRONICS_DETECTOR_IOU,
        image_size=ELECTRONICS_DETECTOR_IMAGE_SIZE,
        frame_skip=ELECTRONICS_DETECTOR_FRAME_SKIP,
        max_dim=ELECTRONICS_DETECTOR_MAX_DIM,
        label_tokens=ELECTRONICS_DETECTOR_LABEL_TOKENS,
    )

    save_dir = Path(args.save_dir)

    if args.image:
        run_on_image(Path(args.image), phone_detector, electronics_detector, save_dir)
    else:
        src = Path(args.source)
        if not src.exists():
            parser.error(f"Source path not found: {src}")
        files = sorted([p for p in src.iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png'}])
        for f in files:
            run_on_image(f, phone_detector, electronics_detector, save_dir)


if __name__ == "__main__":
    main()
