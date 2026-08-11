"""Train the custom prohibited-electronics detector after supplying a YOLO dataset.

Example (from python/):
  python training/train_electronics.py --data training/electronics_dataset.yaml --epochs 100
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune YOLO for prohibited electronics detection.")
    parser.add_argument("--data", default="training/electronics_dataset.yaml", help="YOLO dataset YAML")
    parser.add_argument("--base-model", default="yolo11n.pt", help="Pretrained YOLO checkpoint")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=-1, help="-1 selects an automatic batch size")
    parser.add_argument("--device", default=None, help="CUDA device, 'cpu', or omit for Ultralytics default")
    parser.add_argument("--project", default="runs/electronics")
    parser.add_argument("--name", default="train")
    args = parser.parse_args()

    dataset = Path(args.data)
    if not dataset.is_file():
        parser.error(f"Dataset YAML not found: {dataset}")

    model = YOLO(args.base_model)
    model.train(
        data=str(dataset),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=args.project,
        name=args.name,
        pretrained=True,
        patience=20,
        seed=42,
    )


if __name__ == "__main__":
    main()
