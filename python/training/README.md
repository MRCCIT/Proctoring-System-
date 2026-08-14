# Electronics YOLO workflow

The production sidecar runs two independent YOLO detectors on each analyzed frame:

1. `yolo11n.pt` detects cell phones using the COCO phone class.
2. `electronics_yolo.pt` is a custom model for prohibited electronics. It is disabled safely until that checkpoint exists.

## Dataset contract

Use standard YOLO detection labels: one `.txt` per image, with one row per object:

```text
<class_id> <x_center> <y_center> <width> <height>
```

Coordinates must be normalized to 0–1. Place the dataset outside source control using this layout:

```text
python/data/electronics/
  images/train/  images/val/  [images/test/]
  labels/train/  labels/val/  [labels/test/]
```

The class IDs must match `electronics_dataset.yaml`. The imported dataset uses `Smart Phone`, `Tablet`, `Tablet-and-Smart-phone`, and `iPad`. All four remain in training because a mixed tablet/phone image is useful training data, but runtime only flags labels containing `tablet` or `ipad`; phone-only labels remain the responsibility of the existing model. This filtering is configurable with `ELECTRONICS_DETECTOR_LABEL_TOKENS`.

Include negative images (no prohibited electronics), real proctoring camera angles, varied lighting, partial occlusion, held devices, background screens, and ordinary permitted objects. Keep candidates separate by person/session so near-duplicate frames cannot leak between train and validation sets.

## Train, evaluate, and deploy

From `python/`, after the dataset is present:

```powershell
python training/train_electronics.py --epochs 100 --imgsz 640
```

Review validation precision/recall and per-class confusion before deployment. Test with:

```powershell
yolo detect val model=runs/electronics/train/weights/best.pt data=training/electronics_dataset.yaml
```

Copy the approved `best.pt` to `python/models/electronics_yolo.pt` (or set `ELECTRONICS_YOLO_MODEL_PATH`). Restart the AI sidecar. The `/health` response reports the configured model path, and each unified `/internal/analyze-session` response includes `electronics_detected`, `electronics_labels`, and `electronics_yolo_enabled`.

Tune runtime behavior with `ELECTRONICS_DETECTOR_CONFIDENCE` (default `0.35`), `ELECTRONICS_DETECTOR_IOU` (default `0.45`), and `ELECTRONICS_VISIBLE_STREAK_THRESHOLD` (default `1`). Begin with a higher confidence threshold in a staged environment to minimize false-positive proctoring flags.
