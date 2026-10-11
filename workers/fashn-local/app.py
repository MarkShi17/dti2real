"""Private single-GPU FASHN VTON 1.5 worker. No weights download on startup."""
from __future__ import annotations
import base64
import io
import os
import secrets
from pathlib import Path
from threading import Lock
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

app = FastAPI(title="DTI2IRL FASHN worker", docs_url=None, redoc_url=None)
_lock = Lock()
_pipeline = None
Image.MAX_IMAGE_PIXELS = 24_000_000


class RenderInput(BaseModel):
    person_image: str = Field(max_length=12_000_000)
    garment_image: str = Field(max_length=12_000_000)
    category: Literal["tops", "bottoms", "one-pieces"]
    seed: int = Field(default=42, ge=0, le=2**32 - 1)


@app.middleware("http")
async def bound_payload(request: Request, call_next):
    if request.method == "POST":
        content = bytearray()
        async for chunk in request.stream():
            content.extend(chunk)
            if len(content) > 25_000_000:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
        request._body = bytes(content)
    return await call_next(request)


def decode(value: str) -> Image.Image:
    try:
        header, encoded = value.split(",", 1)
        if header not in {"data:image/png;base64", "data:image/jpeg;base64", "data:image/webp;base64"}:
            raise ValueError("format")
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError("size")
        image = Image.open(io.BytesIO(raw))
        if image.width * image.height > 24_000_000 or min(image.size) < 64:
            raise ValueError("dimensions")
        return ImageOps.exif_transpose(image).convert("RGB")
    except Exception as exc:
        raise HTTPException(400, "Invalid image; use PNG/JPEG/WebP under 8 MB and 24 megapixels") from exc


@app.get("/health")
def health():
    weights = Path(os.environ.get("FASHN_WEIGHTS_DIR", "./weights"))
    return {"status": "ready" if (weights / "model.safetensors").is_file() else "weights_missing", "model": "fashn-vton-1.5", "loaded": _pipeline is not None}


@app.post("/render")
def render(payload: RenderInput, authorization: str | None = Header(default=None)):
    token = os.environ.get("FASHN_WORKER_TOKEN", "")
    if not token or not secrets.compare_digest(authorization or "", f"Bearer {token}"):
        raise HTTPException(401, "Worker token is required")
    if not _lock.acquire(blocking=False):
        raise HTTPException(429, "GPU is processing another image; retry when idle")
    try:
        weights = Path(os.environ.get("FASHN_WEIGHTS_DIR", "./weights"))
        if not (weights / "model.safetensors").is_file():
            raise HTTPException(503, "Download model weights explicitly before rendering")
        person, garment = decode(payload.person_image), decode(payload.garment_image)
        global _pipeline
        if _pipeline is None:
            from fashn_vton import TryOnPipeline
            _pipeline = TryOnPipeline(weights_dir=str(weights))
        result = _pipeline(person_image=person, garment_image=garment, category=payload.category, seed=payload.seed)
        output = io.BytesIO()
        result.images[0].save(output, format="PNG")
        return {"image": "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii"), "provider": "fashn-vton-1.5", "status": "completed"}
    except HTTPException:
        raise
    except Exception as exc:
        # Do not log photos, request data, or provider tokens.
        raise HTTPException(500, "Inference failed. Check weights, CUDA compatibility and available GPU memory") from exc
    finally:
        _lock.release()
