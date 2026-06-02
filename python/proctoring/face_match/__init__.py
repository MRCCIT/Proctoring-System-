"""
ArcFace-style face comparison (from face-match/main.py), exposed as sync helpers
for the FastAPI AI sidecar (no URL fetching here; use run_ai_server for URLs).
"""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import urlparse, unquote
import re

import cv2
import numpy as np
import requests
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms

logger = logging.getLogger(__name__)

try:
    from facenet_pytorch import InceptionResnetV1
except ImportError:  # pragma: no cover
    InceptionResnetV1 = None  # type: ignore


class ArcFaceVerifier:
    def __init__(self) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Any = None
        self.transform = None
        self._initialize_model()

    def _initialize_model(self) -> None:
        if InceptionResnetV1 is None:
            logger.warning("facenet_pytorch not installed; face compare disabled")
            return
        try:
            self.model = InceptionResnetV1(pretrained="vggface2").eval().to(self.device)
            self.transform = transforms.Compose(
                [
                    transforms.Resize((160, 160)),
                    transforms.ToTensor(),
                    transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
                ]
            )
            logger.info("ArcFace (InceptionResnetV1) loaded successfully")
        except Exception as e:  # pragma: no cover
            logger.error("Model initialization failed: %s", e)
            self.model = None

    @property
    def available(self) -> bool:
        return self.model is not None and self.transform is not None

    def preprocess_face(self, face_image: np.ndarray) -> torch.Tensor:
        assert self.transform is not None
        face_rgb = cv2.cvtColor(face_image, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(face_rgb)
        tensor = self.transform(pil_image)
        return tensor.unsqueeze(0).to(self.device)

    def detect_face(self, image: np.ndarray) -> np.ndarray | None:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = detector.detectMultiScale(gray, 1.1, 5, minSize=(48, 48))
        if len(faces) == 0:
            return None
        # Largest face = primary subject (avoids background faces in ID photos).
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        pad = int(0.08 * max(w, h))
        y0 = max(0, y - pad)
        x0 = max(0, x - pad)
        y1 = min(image.shape[0], y + h + pad)
        x1 = min(image.shape[1], x + w + pad)
        return image[y0:y1, x0:x1]

    def extract_embedding(self, face_tensor: torch.Tensor) -> np.ndarray:
        assert self.model is not None
        with torch.no_grad():
            embeddings = self.model(face_tensor)
            embeddings = F.normalize(embeddings).cpu().numpy()
            return embeddings[0]

    @staticmethod
    def calculate_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> tuple[float, float]:
        cosine_sim = float(
            np.dot(embedding1, embedding2) / (np.linalg.norm(embedding1) * np.linalg.norm(embedding2) + 1e-8)
        )
        distance = (1 - cosine_sim) / 2
        similarity = max(0.0, cosine_sim * 100)
        return float(distance), float(similarity)

    def verify_faces(
        self,
        image1: np.ndarray,
        image2: np.ndarray,
        distance_threshold: float | None = None,
        min_similarity_percent: float | None = None,
    ) -> dict:
        if not self.available:
            raise RuntimeError("ArcFace model not available")
        from proctoring.config import ARCFACE_DISTANCE_THRESHOLD, LIVE_MATCH_MIN_SIMILARITY

        if distance_threshold is None:
            distance_threshold = ARCFACE_DISTANCE_THRESHOLD
        if min_similarity_percent is None:
            min_similarity_percent = LIVE_MATCH_MIN_SIMILARITY
        start = time.time()
        face1 = self.detect_face(image1)
        face2 = self.detect_face(image2)
        if face1 is None or face2 is None:
            raise ValueError("Face not detected in one or both images")
        tensor1 = self.preprocess_face(face1)
        tensor2 = self.preprocess_face(face2)
        emb1 = self.extract_embedding(tensor1)
        emb2 = self.extract_embedding(tensor2)
        distance, similarity = self.calculate_similarity(emb1, emb2)
        cosine_01 = max(0.0, 1.0 - 2.0 * distance)
        verified = distance < distance_threshold and similarity >= float(min_similarity_percent)
        return {
            "verified": verified,
            "min_similarity_required": float(min_similarity_percent),
            "distance": round(distance, 4),
            "distance_threshold": distance_threshold,
            "similarity": round(similarity, 2),
            "similarity_score": round(cosine_01, 4),
            "confidence": round(max(0.0, (1 - distance) * 100), 2),
            "processing_time_ms": round((time.time() - start) * 1000, 2),
            "model": "ArcFace-InceptionResnetV1-VGGFace2",
        }


_verifier: ArcFaceVerifier | None = None


def get_arcface_verifier() -> ArcFaceVerifier:
    global _verifier
    if _verifier is None:
        _verifier = ArcFaceVerifier()
    return _verifier


def _preprocess_url(url: str) -> str:
    url = unquote(url)
    if "github.com" in url and "/blob/" in url:
        url = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")
    elif "drive.google.com" in url:
        file_id = None
        for pattern in (r"/file/d/([a-zA-Z0-9-_]+)", r"id=([a-zA-Z0-9-_]+)", r"/d/([a-zA-Z0-9-_]+)"):
            match = re.search(pattern, url)
            if match:
                file_id = match.group(1)
                break
        if file_id:
            url = f"https://drive.google.com/uc?export=download&id={file_id}"
    elif "dropbox.com" in url:
        if "?dl=0" in url:
            url = url.replace("?dl=0", "?dl=1")
        elif "?dl=1" not in url:
            url += "?dl=1" if "?" not in url else "&dl=1"
    elif "imgur.com" in url and not url.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
        img_id = url.split("/")[-1]
        if not img_id.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
            url = f"https://i.imgur.com/{img_id}.jpg"
    return url


def load_image_from_url(url: str, timeout: int = 15) -> np.ndarray:
    if not url or not isinstance(url, str):
        raise ValueError("URL must be a non-empty string")
    parsed = urlparse(url)
    if not parsed.scheme or parsed.scheme not in ("http", "https"):
        raise ValueError("URL must start with http:// or https://")
    processed = _preprocess_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 ProctorShield-AI/1.0",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
    }
    resp = requests.get(processed, timeout=timeout, headers=headers, allow_redirects=True)
    resp.raise_for_status()
    content = resp.content
    if len(content) == 0:
        raise ValueError("Empty response")
    nparr = np.frombuffer(content, dtype=np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image data")
    return image


def compare_faces_from_urls(profile_url: str, live_url: str) -> dict:
    v = get_arcface_verifier()
    img1 = load_image_from_url(profile_url)
    img2 = load_image_from_url(live_url)
    return v.verify_faces(img1, img2)
