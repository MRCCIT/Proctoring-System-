"""Train the custom prohibited-electronics detector after supplying a YOLO dataset.

Example (from python/):
  python training/train_electronics.py --data training/electronics_dataset.yaml --epochs 100
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO
import re
import tempfile


PYTHON_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune YOLO for prohibited electronics detection.")
    parser.add_argument(
        "--data",
        default=str(Path(__file__).with_name("electronics_dataset.yaml")),
        help="YOLO dataset YAML",
    )
    parser.add_argument(
        "--base-model",
        default=str(PYTHON_ROOT / "models" / "yolo11n.pt"),
        help="Pretrained YOLO checkpoint",
    )
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=-1, help="-1 selects an automatic batch size")
    parser.add_argument("--device", default=None, help="CUDA device, 'cpu', or omit for Ultralytics default")
    parser.add_argument("--workers", type=int, default=2, help="Data-loader worker count")
    parser.add_argument("--project", default="runs/electronics")
    parser.add_argument("--name", default="train")
    args = parser.parse_args()

    dataset = Path(args.data).resolve()
    if not dataset.is_file():
        parser.error(f"Dataset YAML not found: {dataset}")

    # Ultralytics resolves dataset 'path:' entries relative to the current working
    # directory, which can break when the YAML uses paths relative to itself.
    # To avoid that, rewrite the dataset YAML with an absolute `path:` resolved
    # relative to the YAML file location and pass the rewritten file to train.
    with open(dataset, "r", encoding="utf-8") as fh:
        yaml_text = fh.read()

    # Find the `path:` line (simple heuristic) and resolve it if relative
    m = re.search(r"^path:\s*(.+)$", yaml_text, flags=re.MULTILINE)
    resolved_yaml_path = dataset
    if m:
        raw_path = m.group(1).strip()
        # strip quotes
        raw_path = raw_path.strip('"\'')
        raw_path_p = Path(raw_path)
        if not raw_path_p.is_absolute():
            base_dir = dataset.parent
            abs_path = (base_dir / raw_path_p).resolve()
            # Use a callable replacement to avoid backslash-escape parsing
            new_yaml_text = re.sub(
                r"^path:\s*.+$",
                lambda _m: f"path: {abs_path}",
                yaml_text,
                flags=re.MULTILINE,
            )
            # write a temp yaml next to original to avoid clutter
            tmp = Path(tempfile.gettempdir()) / f"{dataset.stem}_resolved.yaml"
            tmp.write_text(new_yaml_text, encoding="utf-8")
            resolved_yaml_path = tmp

    model = YOLO(args.base_model)
    model.train(
        data=str(resolved_yaml_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=args.project,
        name=args.name,
        pretrained=True,
        patience=20,
        seed=42,
        workers=args.workers,
    )


if __name__ == "__main__":
    main()
