"""
ProctorShield AI sidecar: wraps gaze (EyeGazeDetector), analyzer (MediaPipe + gaze),
identity (YOLO phone + helpers), and ArcFace face-match flow.
Run from repo:  cd python && set PYTHONPATH=. && uvicorn run_ai_server:app --host 127.0.0.1 --port 5055
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from proctoring.runtime_metrics import METRICS, track_request
from proctoring.config import (
    PHONE_DETECTOR_CONFIDENCE,
    PHONE_DETECTOR_FRAME_SKIP,
    PHONE_DETECTOR_IMAGE_SIZE,
    PHONE_DETECTOR_IOU,
    PHONE_DETECTOR_MAX_DIM,
    PHONE_DETECTOR_MODEL_PATH,
    ELECTRONICS_DETECTOR_CONFIDENCE,
    ELECTRONICS_DETECTOR_FRAME_SKIP,
    ELECTRONICS_DETECTOR_IMAGE_SIZE,
    ELECTRONICS_DETECTOR_IOU,
    ELECTRONICS_DETECTOR_MAX_DIM,
    ELECTRONICS_DETECTOR_MODEL_PATH,
    ELECTRONICS_DETECTOR_LABEL_TOKENS,
)
from proctoring.config import LIVE_MATCH_MIN_SIMILARITY
from proctoring.services.analyzer import ProctorAnalyzer
from proctoring.services.identity import ElectronicsDetector, PhoneDetector, decode_data_url_image, decode_payload_frame
from proctoring.services.session_analyzer import SessionAnalyzer
from proctoring.face_match import get_arcface_verifier, load_image_from_url

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("run_ai_server")

app = FastAPI(title="ProctorShield AI Sidecar", version="1.0.0")

_analyzer: ProctorAnalyzer | None = None
_phone_detector: PhoneDetector | None = None
_electronics_detector: ElectronicsDetector | None = None
_session_analyzer: SessionAnalyzer | None = None
_models_ready: bool = False


def get_analyzer() -> ProctorAnalyzer:
    global _analyzer
    if _analyzer is None:
        log.info("Loading ProctorAnalyzer (MediaPipe + gaze)...")
        _analyzer = ProctorAnalyzer()
    return _analyzer


def get_session_analyzer() -> SessionAnalyzer:
    global _session_analyzer
    if _session_analyzer is None:
        _session_analyzer = SessionAnalyzer(get_analyzer(), get_phone_detector(), get_electronics_detector())
    return _session_analyzer


def get_phone_detector() -> PhoneDetector:
    global _phone_detector
    if _phone_detector is None:
        log.info("Loading PhoneDetector (YOLO path=%s)...", PHONE_DETECTOR_MODEL_PATH)
        _phone_detector = PhoneDetector(
            model_path=PHONE_DETECTOR_MODEL_PATH,
            confidence=PHONE_DETECTOR_CONFIDENCE,
            iou=PHONE_DETECTOR_IOU,
            image_size=PHONE_DETECTOR_IMAGE_SIZE,
            frame_skip=PHONE_DETECTOR_FRAME_SKIP,
            max_dim=PHONE_DETECTOR_MAX_DIM,
        )
    return _phone_detector


def get_electronics_detector() -> ElectronicsDetector:
    global _electronics_detector
    if _electronics_detector is None:
        log.info("Loading ElectronicsDetector (YOLO path=%s)...", ELECTRONICS_DETECTOR_MODEL_PATH)
        _electronics_detector = ElectronicsDetector(
            model_path=ELECTRONICS_DETECTOR_MODEL_PATH,
            confidence=ELECTRONICS_DETECTOR_CONFIDENCE,
            iou=ELECTRONICS_DETECTOR_IOU,
            image_size=ELECTRONICS_DETECTOR_IMAGE_SIZE,
            frame_skip=ELECTRONICS_DETECTOR_FRAME_SKIP,
            max_dim=ELECTRONICS_DETECTOR_MAX_DIM,
            label_tokens=ELECTRONICS_DETECTOR_LABEL_TOKENS,
        )
    return _electronics_detector


class ImagePayload(BaseModel):
    image: str = Field(..., description="data URL (e.g. image/jpeg;base64,...) or raw base64")


class FaceComparePayload(BaseModel):
    profile_url: str | None = None
    live_url: str | None = None
    reference_image: str | None = Field(None, description="data URL / base64")
    live_image: str | None = Field(None, description="data URL / base64")
    identity_threshold: float | None = Field(
        None,
        description="Minimum similarity 0–100 (ArcFace). Defaults to LIVE_MATCH_MIN_SIMILARITY.",
    )


class AnalyzeSessionPayload(BaseModel):
    image: str = Field(..., description="JPEG data URL or base64")
    reference_image: str | None = Field(None, description="Enrolled reference for identity match")
    identity_threshold: float | None = Field(None, description="ArcFace threshold; default from config")
    phone_streak: int = Field(0, description="Prior consecutive phone-positive frames (Node state)")
    phone_active: bool = Field(False, description="Whether phone_visible already flagged")
    electronics_streak: int = Field(0, description="Prior consecutive electronics-positive frames")
    electronics_active: bool = Field(False, description="Whether electronics_visible already flagged")
    multiple_face_streak: int = Field(0, description="Prior consecutive accepted multi-face frames")
    multiple_face_active: bool = Field(False, description="Whether multiple_faces_detected already flagged")
    identity_mismatch_streak: int = Field(0, description="Prior identity mismatch streak")
    tick_index: int = Field(0, description="Monotonic tick counter from Node")
    run_identity: bool = Field(False, description="Run ArcFace this tick (expensive; default off)")
    run_phone: bool = Field(True, description="Run YOLO phone detector this tick")
    run_electronics: bool = Field(True, description="Run custom YOLO electronics detector this tick")
    run_deep_gaze: bool | None = Field(
        None,
        description="Use RetinaNet gaze; when omitted, alternates by tick_index for speed",
    )
    modules: dict[str, bool] | None = Field(
        None,
        description="Optional policy modules; disabled detectors are no-ops / filtered",
    )


def _preload_models() -> None:
    global _models_ready
    try:
        get_session_analyzer()
        v = get_arcface_verifier()
        if v.available:
            log.info("ArcFace verifier available")
        _models_ready = True
        log.info("AI models preloaded (face, gaze, phone, identity)")
    except Exception as exc:
        log.warning("AI preload failed (will load on first request): %s", exc)


@app.on_event("startup")
def _startup_preload() -> None:
    import threading

    threading.Thread(target=_preload_models, name="ai-preload", daemon=True).start()


def _model_status() -> dict:
    arc = None
    try:
        arc = get_arcface_verifier()
    except Exception:
        arc = None
    phone = _phone_detector
    electronics = _electronics_detector
    return {
        "ready": _models_ready,
        "analyzer_loaded": _analyzer is not None,
        "session_analyzer_loaded": _session_analyzer is not None,
        "phone_detector": {
            "loaded": phone is not None,
            "enabled": bool(getattr(phone, "enabled", False)) if phone else False,
            "model_path": PHONE_DETECTOR_MODEL_PATH,
        },
        "electronics_detector": {
            "loaded": electronics is not None,
            "enabled": bool(getattr(electronics, "enabled", False)) if electronics else False,
            "model_path": ELECTRONICS_DETECTOR_MODEL_PATH,
        },
        "arcface": {
            "available": bool(getattr(arc, "available", False)) if arc else False,
        },
        "yolo_model": PHONE_DETECTOR_MODEL_PATH,
        "electronics_yolo_model": ELECTRONICS_DETECTOR_MODEL_PATH,
    }


@app.get("/health")
def health() -> dict:
    snap = METRICS.snapshot(models=_model_status())
    # Keep legacy fields for older probes while exposing full capacity data.
    return {
        **snap,
        "status": "ok" if snap["status"] in ("healthy", "degraded") else snap["status"],
        "health": snap["status"],
        "models_ready": _models_ready,
        "yolo_model": PHONE_DETECTOR_MODEL_PATH,
        "electronics_yolo_model": ELECTRONICS_DETECTOR_MODEL_PATH,
    }


@app.get("/metrics")
def metrics() -> dict:
    return METRICS.snapshot(models=_model_status())


@app.post("/internal/analyze-session")
def analyze_session(body: AnalyzeSessionPayload) -> dict:
    """
    Single-call proctoring tick (~6–7 Hz from Node): face, gaze, phone, optional identity.
    Mirrors reference backend /analyze_frame aggregation.
    """
    import time

    try:
        with track_request("analyze-session"):
            return _analyze_session_inner(body)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e), headers={"Retry-After": "1"}) from e


def _analyze_session_inner(body: AnalyzeSessionPayload) -> dict:
    t0 = time.perf_counter()
    try:
        frame = decode_payload_frame(body.model_dump(), key="image")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    from proctoring.services.fast_frame import resize_for_inference

    frame = resize_for_inference(frame)

    from proctoring.config import DEEP_GAZE_EVERY_N_TICKS

    tick = int(body.tick_index or 0)
    if body.run_deep_gaze is None:
        deep_gaze = tick % max(1, DEEP_GAZE_EVERY_N_TICKS) == 0
    else:
        deep_gaze = bool(body.run_deep_gaze)

    modules = body.modules or {}

    def module_on(key: str, default: bool = True) -> bool:
        if key not in modules:
            return default
        return bool(modules[key])

    run_phone = bool(body.run_phone) and module_on("object_detection")
    run_electronics = bool(body.run_electronics) and module_on("object_detection")
    deep_gaze = deep_gaze and module_on("gaze_tracking")

    sa = get_session_analyzer()
    core = sa.analyze_frame_core(
        frame,
        run_phone=run_phone,
        run_electronics=run_electronics,
        deep_gaze=deep_gaze,
    )
    violations = [item for item in core["violations"] if item != "multiple_faces_detected"]
    if module_on("multiple_faces"):
        multiple_face_flagged, multiple_face_streak, multiple_face_active = sa.apply_multiple_face_streak(
            int(core["face_count"]),
            int(body.multiple_face_streak or 0),
            bool(body.multiple_face_active),
        )
        violations.extend(multiple_face_flagged)
    else:
        multiple_face_flagged, multiple_face_streak, multiple_face_active = [], int(body.multiple_face_streak or 0), bool(body.multiple_face_active)

    phone_flagged, phone_streak, phone_active = sa.apply_phone_streak(
        bool(core["phone_detected"]),
        int(body.phone_streak or 0),
        bool(body.phone_active),
    )
    violations.extend(phone_flagged)
    electronics_flagged, electronics_streak, electronics_active = sa.apply_electronics_streak(
        bool(core["electronics_detected"]),
        int(body.electronics_streak or 0),
        bool(body.electronics_active),
        fresh=bool(core.get("electronics_fresh")),
    )
    violations.extend(electronics_flagged)

    identity_match: bool | None = None
    identity_score: float | None = None
    identity_mismatch_streak = int(body.identity_mismatch_streak or 0)

    raw_threshold = body.identity_threshold
    if raw_threshold is not None:
        threshold = float(raw_threshold)
        min_similarity = threshold * 100 if threshold <= 1 else threshold
    else:
        min_similarity = LIVE_MATCH_MIN_SIMILARITY

    run_id = bool(body.run_identity)
    if not run_id:
        from proctoring.config import IDENTITY_EVERY_N_TICKS

        run_id = int(body.tick_index or 0) % max(1, IDENTITY_EVERY_N_TICKS) == 0

    if run_id and body.reference_image and int(core["face_count"]) == 1:
        # Skip compare under bad pose/light, but keep streak (do not wipe progress).
        if "looking_sideways" in violations or "low_lighting" in violations:
            pass
        else:
            try:
                v = get_arcface_verifier()
                if v.available:
                    ref = decode_data_url_image(body.reference_image)
                    live = frame
                    out = v.verify_faces(ref, live)
                    identity_score = float(out.get("similarity", 0))
                    # <35% on same-person paths almost always means a bad crop /
                    # non-face compare (old Haar center-fallback ~19%). Skip streak.
                    if identity_score < 35.0:
                        log.warning(
                            "identity score %.1f%% looks like a bad crop; skipping mismatch streak",
                            identity_score,
                        )
                        identity_match = None
                    else:
                        identity_match = bool(out.get("verified"))
                        if identity_score < min_similarity:
                            identity_match = False
                        if identity_match:
                            identity_mismatch_streak = 0
                        else:
                            identity_mismatch_streak += 1
                else:
                    identity_match = None
            except Exception as exc:
                log.warning("identity compare skipped: %s", exc)
                identity_match = None

    from proctoring.config import LIVE_IDENTITY_MISMATCH_STREAK_THRESHOLD as _id_streak

    if identity_mismatch_streak >= _id_streak:
        violations.append("identity_mismatch")

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    return {
        **core,
        "violations": violations,
        "phone_streak": phone_streak,
        "phone_active": phone_active,
        "electronics_streak": electronics_streak,
        "electronics_active": electronics_active,
        "multiple_face_streak": multiple_face_streak,
        "multiple_face_active": multiple_face_active,
        "identity_match": identity_match,
        "identity_score": identity_score,
        "identity_mismatch_streak": identity_mismatch_streak,
        "identity_threshold": min_similarity,
        "tick_index": tick,
        "run_identity": run_id,
        "run_deep_gaze": deep_gaze,
        "processing_time_ms": elapsed_ms,
    }


@app.post("/internal/analyze-frame")
def analyze_frame(body: ImagePayload) -> dict:
    try:
        with track_request("analyze-frame"):
            try:
                frame = decode_payload_frame(body.model_dump(), key="image")
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            result = get_analyzer().analyze(frame)
            return {
                "face_count": result.face_count,
                "sideways_score": result.sideways_score,
                "violations": result.violations,
                "gaze_direction": result.gaze_direction,
                "gaze_score": result.gaze_score,
                "gaze_detector": result.gaze_detector,
            }
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e), headers={"Retry-After": "1"}) from e


@app.post("/internal/phone-detect")
def phone_detect(body: ImagePayload) -> dict:
    try:
        with track_request("phone-detect"):
            try:
                frame = decode_payload_frame(body.model_dump(), key="image")
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            pd = get_phone_detector()
            detected = pd.detect_phone(frame)
            return {"phone_detected": detected, "yolo_enabled": pd.enabled}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e), headers={"Retry-After": "1"}) from e


@app.post("/internal/electronics-detect")
def electronics_detect(body: ImagePayload) -> dict:
    try:
        with track_request("electronics-detect"):
            try:
                frame = decode_payload_frame(body.model_dump(), key="image")
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e)) from e
            result = get_electronics_detector().detect_electronics(frame)
            return {
                "electronics_detected": result["detected"],
                "electronics_labels": result["labels"],
                "yolo_enabled": get_electronics_detector().enabled,
            }
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e), headers={"Retry-After": "1"}) from e


def _resolve_min_similarity(threshold: float | None) -> float:
    if threshold is None:
        return LIVE_MATCH_MIN_SIMILARITY
    t = float(threshold)
    return t * 100 if 0 < t <= 1 else t


@app.post("/internal/face-compare")
def face_compare(body: FaceComparePayload) -> dict:
    try:
        with track_request("face-compare"):
            return _face_compare_inner(body)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e), headers={"Retry-After": "1"}) from e


def _face_compare_inner(body: FaceComparePayload) -> dict:
    min_sim = _resolve_min_similarity(body.identity_threshold)
    try:
        v = get_arcface_verifier()
        if not v.available:
            raise HTTPException(status_code=501, detail="ArcFace (facenet_pytorch) not available")

        img1 = None
        img2 = None
        if body.profile_url:
            img1 = load_image_from_url(body.profile_url)
        elif body.reference_image:
            try:
                img1 = decode_data_url_image(body.reference_image)
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e)) from e

        if body.live_url:
            img2 = load_image_from_url(body.live_url)
        elif body.live_image:
            try:
                img2 = decode_data_url_image(body.live_image)
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e)) from e

        if img1 is not None and img2 is not None:
            return v.verify_faces(img1, img2, min_similarity_percent=min_sim)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    raise HTTPException(
        status_code=422,
        detail="Provide reference (profile_url or reference_image) AND live (live_url or live_image)",
    )


if __name__ == "__main__":
    import os
    import uvicorn

    host = os.environ.get("AI_HOST", "127.0.0.1")
    port = int(os.environ.get("AI_PORT", "5055"))
    log.info("Starting ProctorShield AI sidecar on http://%s:%s", host, port)
    uvicorn.run("run_ai_server:app", host=host, port=port, reload=False, log_level="info")
