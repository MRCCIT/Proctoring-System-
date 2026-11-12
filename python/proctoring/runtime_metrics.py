"""Lightweight request timing metrics for the AI sidecar."""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional


class _Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts: Dict[str, int] = defaultdict(int)
        self._total_ms: Dict[str, float] = defaultdict(float)
        self._errors: Dict[str, int] = defaultdict(int)
        self.started_at = time.time()

    def record(self, name: str, duration_ms: float, *, error: bool = False) -> None:
        with self._lock:
            self._counts[name] += 1
            self._total_ms[name] += duration_ms
            if error:
                self._errors[name] += 1

    def snapshot(self, models: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        with self._lock:
            routes = {}
            for name, count in self._counts.items():
                total = self._total_ms.get(name, 0.0)
                routes[name] = {
                    "count": count,
                    "errors": self._errors.get(name, 0),
                    "avg_ms": round(total / count, 2) if count else 0.0,
                }
            error_total = sum(self._errors.values())
            status = "degraded" if error_total else "healthy"
            return {
                "status": status,
                "uptime_seconds": round(time.time() - self.started_at, 1),
                "routes": routes,
                "models": models or {},
            }


METRICS = _Metrics()


@contextmanager
def track_request(name: str) -> Iterator[None]:
    started = time.perf_counter()
    err = False
    try:
        yield
    except Exception:
        err = True
        raise
    finally:
        METRICS.record(name, (time.perf_counter() - started) * 1000.0, error=err)
