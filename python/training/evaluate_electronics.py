"""Evaluate the trained electronics YOLO on the dataset validation images.

Supports two modes:
- `--run-val` : run Ultralytics `model.val(data=...)` to compute built-in metrics.
- `--annotate` : run per-image inference, save annotated images, and emit a CSV summary.

Example:
  python training/evaluate_electronics.py --model python/models/electronics_yolo.pt --data training/electronics_dataset.yaml --annotate --save-dir runs/eval_electronics

"""

from __future__ import annotations

import sys
import argparse
from pathlib import Path as _Path_for_sys

# Ensure local `python/` package root is on sys.path so `proctoring` imports work
_repo_python_root = _Path_for_sys(__file__).resolve().parents[1]
if str(_repo_python_root) not in sys.path:
    sys.path.insert(0, str(_repo_python_root))
import csv
import re
import tempfile
from pathlib import Path
from typing import List

from ultralytics import YOLO

from proctoring.config import ELECTRONICS_DETECTOR_MODEL_PATH


def resolve_dataset_val_path(dataset_yaml: Path) -> Path:
    """Resolve the `val:` entry in a YOLO dataset YAML to an absolute path.

    Falls back to treating the provided path as a directory if parsing fails.
    """
    if not dataset_yaml.exists():
        raise FileNotFoundError(f"Dataset YAML not found: {dataset_yaml}")
    text = dataset_yaml.read_text(encoding="utf-8")
    m = re.search(r"^val:\s*(.+)$", text, flags=re.MULTILINE)
    if not m:
        raise ValueError("Could not find 'val:' entry in dataset YAML")
    raw = m.group(1).strip().strip('"\'')
    p = Path(raw)
    if not p.is_absolute():
        p = (dataset_yaml.parent / p).resolve()
    return p


def gather_images_from_path(path: Path) -> List[Path]:
    if path.is_dir():
        exts = {".jpg", ".jpeg", ".png", ".bmp"}
        return sorted([p for p in path.rglob("*") if p.suffix.lower() in exts])
    if path.is_file():
        # might be a text file of image paths
        lines = [l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
        return [Path(l) if Path(l).is_absolute() else (path.parent / l).resolve() for l in lines]
    raise ValueError(f"Unsupported val path: {path}")


def run_per_image_annotation(model: YOLO, images: List[Path], save_dir: Path, conf: float, iou: float, imgsz: int):
    save_dir.mkdir(parents=True, exist_ok=True)
    csv_path = save_dir / "detections.csv"
    total = 0
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["image", "detected", "labels", "confidences"])
        for img in images:
            total += 1
            try:
                results = model.predict(source=str(img), conf=conf, iou=iou, imgsz=imgsz, verbose=False)
            except Exception as e:
                print(f"Skipping {img}: predict failed: {e}")
                continue
            labels = []
            confs = []
            if results and getattr(results[0], "boxes", None) is not None:
                r = results[0]
                boxes = r.boxes
                names = getattr(r, "names", {})
                for cid, confv in zip(boxes.cls.tolist(), boxes.conf.tolist()):
                    lab = str(names.get(int(cid), cid)) if isinstance(names, dict) else str(cid)
                    labels.append(lab)
                    confs.append(f"{float(confv):.3f}")

            detected = bool(labels)
            writer.writerow([str(img), "1" if detected else "0", ";".join(labels), ";".join(confs)])

            # save annotated output using Ultralytics built-in saver: save results to project folder
            try:
                model.predict(source=str(img), conf=conf, iou=iou, imgsz=imgsz, save=True, project=str(save_dir), name="annotated", verbose=False)
            except Exception:
                pass

    print(f"Annotated {total} images; CSV written to {csv_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate electronics YOLO on validation set")
    parser.add_argument("--model", default=ELECTRONICS_DETECTOR_MODEL_PATH, help="Path to electronics YOLO weights")
    parser.add_argument("--data", default=str(Path(__file__).with_name("electronics_dataset.yaml")), help="YOLO dataset YAML")
    parser.add_argument("--run-val", action="store_true", help="Run Ultralytics built-in val() metrics")
    parser.add_argument("--annotate", action="store_true", help="Annotate validation images and save CSV summary")
    parser.add_argument("--save-dir", default="runs/eval_electronics", help="Directory to save annotated outputs and CSV")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--conf", type=float, default=0.35)
    parser.add_argument("--iou", type=float, default=0.45)
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")

    model = YOLO(str(model_path))

    dataset_yaml = Path(args.data)
    if not dataset_yaml.exists():
        raise FileNotFoundError(f"Dataset YAML not found: {dataset_yaml}")

    val_path = resolve_dataset_val_path(dataset_yaml)

    if args.run_val:
        print("Running Ultralytics val() on dataset...")
        try:
            # Rewrite dataset YAML 'path:' entry to absolute path (Ultralytics may
            # resolve relative dataset paths against a global datasets dir).
            with dataset_yaml.open("r", encoding="utf-8") as fh:
                yaml_text = fh.read()
            m = re.search(r"^path:\s*(.+)$", yaml_text, flags=re.MULTILINE)
            resolved_yaml_path = dataset_yaml
            if m:
                raw_path = m.group(1).strip().strip('"\'')
                raw_path_p = Path(raw_path)
                if not raw_path_p.is_absolute():
                    abs_path = (dataset_yaml.parent / raw_path_p).resolve()
                    new_yaml_text = re.sub(r"^path:\s*.+$", lambda _m: f"path: {abs_path}", yaml_text, flags=re.MULTILINE)
                    tmp = Path(tempfile.gettempdir()) / f"{dataset_yaml.stem}_resolved.yaml"
                    tmp.write_text(new_yaml_text, encoding="utf-8")
                    resolved_yaml_path = tmp
            res = model.val(data=str(resolved_yaml_path))
            print(res)
        except Exception as e:
            print("model.val failed:", e)

    if args.annotate:
        images = gather_images_from_path(val_path)
        if not images:
            raise RuntimeError(f"No images found in validation path: {val_path}")
        run_per_image_annotation(model, images, Path(args.save_dir), args.conf, args.iou, args.imgsz)


if __name__ == "__main__":
    main()
