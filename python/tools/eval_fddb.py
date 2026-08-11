#!/usr/bin/env python3
"""Evaluate MediaPipe face detection on the FDDB dataset.

The script supports this layout:
  Dataset_FDDB/
    images/
    label.txt

Usage:
  python eval_fddb.py --images-source "C:/path/to/Dataset_FDDB.zip"
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import requests

try:
    from tqdm import tqdm
except Exception:
    tqdm = lambda x, **kw: x

import numpy as np
from PIL import Image

from mediapipe.tasks.python.core import base_options as base_options_module
from mediapipe.tasks.python.vision import face_detector
from mediapipe.tasks.python.vision.core import image as image_module
from mediapipe.tasks.python.vision.core import vision_task_running_mode as running_mode_module

logging.basicConfig(level=logging.INFO, format="%(message)s")

"""
FACE_DETECTOR_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
)
"""
FACE_DETECTOR_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite"
)


def find_images_root(base: Path) -> Path:
    """Find the folder that contains the image tree after zip extraction."""
    candidates = [base, base / "Dataset_FDDB"]
    for candidate in candidates:
        if (candidate / "images").exists() or (candidate / "originalPics").exists():
            return candidate

    for child in base.iterdir():
        if not child.is_dir():
            continue
        if (child / "images").exists() or (child / "originalPics").exists():
            return child
        dataset_root = child / "Dataset_FDDB"
        if (dataset_root / "images").exists() or (dataset_root / "originalPics").exists():
            return dataset_root

    logging.warning("Could not find an image root folder under %s", base)
    return base


def find_annotation_files(base: Path) -> list[Path]:
    """Find FDDB annotation files in either FDDB-folds/ or label.txt form."""
    candidates = [base, base / "Dataset_FDDB"]
    for root in candidates:
        label_file = root / "label.txt"
        if label_file.exists():
            logging.info("Found annotation file at %s", label_file)
            return [label_file]

        folds_dir = root / "FDDB-folds"
        if folds_dir.exists():
            files = sorted(folds_dir.glob("*-ellipseList.txt"))
            if files:
                logging.info("Found %d ellipse list file(s) in %s", len(files), folds_dir)
                return files

    for child in base.iterdir():
        if not child.is_dir():
            continue
        label_file = child / "label.txt"
        if label_file.exists():
            logging.info("Found annotation file at %s", label_file)
            return [label_file]
        folds_dir = child / "FDDB-folds"
        if folds_dir.exists():
            files = sorted(folds_dir.glob("*-ellipseList.txt"))
            if files:
                logging.info("Found %d ellipse list file(s) in %s", len(files), folds_dir)
                return files

    logging.warning("No FDDB annotations found under %s", base)
    return []


def parse_annotation_file(path: Path) -> dict[str, int]:
    """Parse either a normal FDDB fold file or the bundled label.txt format."""
    mapping: dict[str, int] = {}
    with open(path, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    i = 0
    while i < len(lines):
        img_rel = lines[i].lstrip("#").strip()
        i += 1
        if i >= len(lines):
            break

        try:
            face_count = int(lines[i])
            i += 1
            mapping[img_rel] = face_count
            i += face_count
        except ValueError:
            face_count = 0
            while i < len(lines) and not lines[i].startswith("#"):
                face_count += 1
                i += 1
            mapping[img_rel] = face_count

    return mapping


def resolve_image(images_root: Path, rel_path: str) -> Path:
    """Resolve an annotation path to a concrete image file."""
    candidates = [
        images_root / "images" / (rel_path),
        images_root / "originalPics" / (rel_path),
        images_root / (rel_path),
        images_root / "Dataset_FDDB" / "images" / (rel_path),
        images_root / "Dataset_FDDB" / "originalPics" / (rel_path),
    ]

    if rel_path.startswith("images/") or rel_path.startswith("originalPics/"):
        candidates.insert(0, images_root / (rel_path))

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return candidates[0]


def ensure_face_detector_model(model_dir: Path) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    #model_path = model_dir / "blaze_face_short_range.tflite"
    model_path = model_dir / "blaze_face_full_range.tflite"
    if model_path.exists() and model_path.stat().st_size > 0:
        return model_path

    logging.info("Downloading face detector model to %s", model_path)
    response = requests.get(FACE_DETECTOR_MODEL_URL, timeout=60)
    response.raise_for_status()
    model_path.write_bytes(response.content)
    return model_path


def create_face_detector(model_path: Path, min_conf: float = 0.5):
    base_options = base_options_module.BaseOptions(model_asset_path=str(model_path))
    options = face_detector.FaceDetectorOptions(
        base_options=base_options,
        running_mode=running_mode_module.VisionTaskRunningMode.IMAGE,
        min_detection_confidence=min_conf,
    )
    return face_detector.FaceDetector.create_from_options(options)

def apply_iou_deduplication(detections, iou_threshold=0.5):
    """
    Remove duplicate detections of the same face using IoU.
    Higher iou_threshold = less aggressive, keeps more detections.
    Lower iou_threshold = more aggressive, removes more overlapping boxes.
    """
    if len(detections) <= 1:
        return detections

    boxes = []
    for det in detections:
        bbox = det.bounding_box
        boxes.append([
            bbox.origin_x,
            bbox.origin_y,
            bbox.origin_x + bbox.width,
            bbox.origin_y + bbox.height
        ])

    keep = []
    used = set()
    for i in range(len(boxes)):
        if i in used:
            continue
        keep.append(i)
        for j in range(i + 1, len(boxes)):
            if j in used:
                continue
            xi1 = max(boxes[i][0], boxes[j][0])
            yi1 = max(boxes[i][1], boxes[j][1])
            xi2 = min(boxes[i][2], boxes[j][2])
            yi2 = min(boxes[i][3], boxes[j][3])
            inter = max(0, xi2 - xi1) * max(0, yi2 - yi1)
            area_i = (boxes[i][2] - boxes[i][0]) * (boxes[i][3] - boxes[i][1])
            area_j = (boxes[j][2] - boxes[j][0]) * (boxes[j][3] - boxes[j][1])
            union = area_i + area_j - inter
            iou = inter / (union + 1e-8)
            if iou > iou_threshold:
                used.add(j)

    return [detections[i] for i in keep]

def run_evaluation(images_root: Path, annotation_files: list[Path], model_selection: int = 1, min_conf: float = 0.5, iou_threshold: float = 0.5):
    all_annotations: dict[str, int] = {}
    for annotation_file in annotation_files:
        all_annotations.update(parse_annotation_file(annotation_file))

    logging.info("Total images to evaluate: %d", len(all_annotations))
    logging.info("Running with model_selection: %d", model_selection)
    logging.info("Running with min_conf: %f", min_conf)
    logging.info("Running with iou_threshold: %f", iou_threshold)

    model_path = ensure_face_detector_model(Path(__file__).resolve().parent.parent / "models")
    detector = create_face_detector(model_path, min_conf=min_conf)

    rows = []
    missing = 0

    for rel_path, true_count in tqdm([item for item in all_annotations.items() if item[1] <= 3], desc="Evaluating"):
        img_path = resolve_image(images_root, rel_path)
        if not img_path.exists():
            logging.warning("Missing: %s", img_path)
            missing += 1
            continue

        try:
            img = Image.open(img_path).convert("RGB")
            rgb = np.asarray(img)
        except Exception as exc:
            logging.warning("Failed to read %s: %s", img_path, exc)
            continue

        mp_image = image_module.Image(image_format=image_module.ImageFormat.SRGB, data=rgb)
        results = detector.detect(mp_image)
        detections = apply_iou_deduplication(results.detections or [], iou_threshold=iou_threshold)
        pred = len(detections)
        rows.append((rel_path, int(true_count), pred))

    if missing:
        logging.warning("%d image(s) were not found on disk", missing)

    return rows


def print_summary(rows, out_csv: str = "fddb_counts.csv"):
    total = len(rows)
    if total == 0:
        print("No images evaluated.")
        return

    exact = sum(1 for _, t, p in rows if t == p)
    mae = sum(abs(t - p) for _, t, p in rows) / total
    over = sum(1 for _, t, p in rows if p > t)
    under = sum(1 for _, t, p in rows if p < t)

    print(
        json.dumps(
            {
                "images_evaluated": total,
                "exact_count_accuracy": round(exact / total, 4),
                "mean_absolute_error": round(mae, 4),
                "overcounted": over,
                "undercounted": under,
            },
            indent=2,
        )
    )

    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["image", "true_count", "pred_count", "error"])
        for rel_path, true_count, pred_count in rows:
            writer.writerow([rel_path, true_count, pred_count, pred_count - true_count])

    logging.info("CSV written to %s", out_csv)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--images-source", required=True, help="Path to Dataset_FDDB.zip or extracted folder")
    parser.add_argument("--annotation-file", default=None, help="Optional single annotation file")
    parser.add_argument("--out-csv", default="fddb_counts.csv")
    parser.add_argument("--model-selection", type=int, choices=[0, 1], default=1)
    parser.add_argument("--min-confidence", type=float, default=0.5)
    parser.add_argument("--iou-threshold", type=float, default=0.5, help="IoU threshold for deduplication of overlapping detections")
    args = parser.parse_args()

    tmpdir = None
    source = Path(args.images_source)

    if source.suffix.lower() == ".zip":
        tmpdir = tempfile.TemporaryDirectory()
        logging.info("Extracting zip...")
        with zipfile.ZipFile(source, "r") as zip_file:
            zip_file.extractall(tmpdir.name)
        base = Path(tmpdir.name)
    else:
        base = source

    images_root = find_images_root(base)
    logging.info("Images root: %s", images_root)

    if args.annotation_file:
        annotation_files = [Path(args.annotation_file)]
    else:
        annotation_files = find_annotation_files(base)

    if not annotation_files:
        logging.error("No annotation files found. Pass --annotation-file or place label.txt / FDDB-folds in the zip.")
        return

    rows = run_evaluation(
        images_root=images_root,
        annotation_files=annotation_files,
        model_selection=args.model_selection,
        min_conf=args.min_confidence,
        iou_threshold=args.iou_threshold,
    )

    print_summary(rows, out_csv=args.out_csv)

    if tmpdir:
        tmpdir.cleanup()


if __name__ == "__main__":
    main()