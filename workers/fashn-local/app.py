"""Private single-GPU FASHN VTON 1.5 worker. No weights download on startup."""
from __future__ import annotations
import base64
import io
import os
import secrets
import gc
from datetime import datetime, timezone
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
_pipeline_kind = None
Image.MAX_IMAGE_PIXELS = 24_000_000


class RenderInput(BaseModel):
    person_image: str = Field(max_length=12_000_000)
    garment_image: str = Field(max_length=12_000_000)
    category: Literal["tops", "bottoms", "one-pieces"]
    seed: int = Field(default=42, ge=0, le=2**32 - 1)


class PoseInput(BaseModel):
    wardrobe_image: str = Field(max_length=12_000_000)
    identity_image: str = Field(max_length=12_000_000)
    pose_image: str = Field(max_length=12_000_000)
    pose: Literal['runway', 'hip', 'peace', 'shoulder', 'lean']
    pose_prompt: str = Field(max_length=1000)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)


@app.middleware("http")
async def bound_payload(request: Request, call_next):
    if request.method == "POST":
        content = bytearray()
        async for chunk in request.stream():
            content.extend(chunk)
            if len(content) > 37_000_000:
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


def authenticate(authorization):
    token = os.environ.get('FASHN_WORKER_TOKEN', '')
    if not token or not secrets.compare_digest(authorization or '', f'Bearer {token}'):
        raise HTTPException(401, 'Worker token is required')


def cuda_available():
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def health():
    weights = Path(os.environ.get('FASHN_WEIGHTS_DIR', './weights'))
    pose_weights = Path(os.environ.get('POSE_WEIGHTS_DIR', './pose-weights'))
    cuda = cuda_available()
    expiry = os.environ.get('GPU_EXPIRES_AT')
    expired = False
    if expiry:
        try:
            expired = datetime.now(timezone.utc) >= datetime.fromisoformat(expiry.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            expired = True
    def capability(complete):
        return {'ready': cuda and complete and not expired, 'reason': 'lease_expired' if expired else 'ready' if cuda and complete else 'cuda_unavailable' if not cuda else 'weights_missing'}
    return {'cuda_available': cuda,
            'tryon': capability(all((weights / path).is_file() for path in ('model.safetensors', 'dwpose/yolox_l.onnx', 'dwpose/dw-ll_ucoco_384.onnx', '.prepared'))),
            'pose': capability(all((pose_weights / path).is_file() for path in ('model_index.json', '.prepared'))),
            'loaded': _pipeline_kind, 'busy': _lock.locked()}


@app.get('/health')
def health_endpoint(authorization: str | None = Header(default=None)):
    authenticate(authorization)
    return health()


def require_ready(kind):
    if not health()[kind]['ready']:
        raise HTTPException(503, 'Explicitly prepare all model weights and CUDA before rendering')


def pipeline_for(kind):
    global _pipeline, _pipeline_kind
    if kind != _pipeline_kind:
        _pipeline = None
        _pipeline_kind = None
        gc.collect()
        import torch
        torch.cuda.empty_cache()
        if kind == 'tryon':
            from fashn_vton import TryOnPipeline
            _pipeline = TryOnPipeline(weights_dir=os.environ.get('FASHN_WEIGHTS_DIR', './weights'), device='cuda')
        else:
            from diffusers import Flux2KleinPipeline
            _pipeline = Flux2KleinPipeline.from_pretrained(os.environ.get('POSE_WEIGHTS_DIR', './pose-weights'), torch_dtype=torch.bfloat16, local_files_only=True).to('cuda')
        _pipeline_kind = kind
    return _pipeline


def image_response(image, provider):
    output = io.BytesIO()
    image.save(output, format='PNG')
    return {'image': 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode('ascii'), 'provider': provider, 'status': 'completed'}


@app.post("/render")
def render(payload: RenderInput, authorization: str | None = Header(default=None)):
    authenticate(authorization)
    if not _lock.acquire(blocking=False):
        raise HTTPException(429, "GPU is processing another image; retry when idle")
    try:
        require_ready('tryon')
        person, garment = decode(payload.person_image), decode(payload.garment_image)
        result = pipeline_for('tryon')(person_image=person, garment_image=garment, category=payload.category, seed=payload.seed)
        return image_response(result.images[0], 'fashn-vton-1.5')
    except HTTPException:
        raise
    except Exception as exc:
        # Do not log photos, request data, or provider tokens.
        raise HTTPException(500, "Inference failed. Check weights, CUDA compatibility and available GPU memory") from exc
    finally:
        _lock.release()


@app.post('/pose')
def pose(payload: PoseInput, authorization: str | None = Header(default=None)):
    authenticate(authorization)
    if not _lock.acquire(blocking=False):
        raise HTTPException(429, 'GPU is processing another image; retry when idle')
    try:
        require_ready('pose')
        wardrobe, identity, reference = (decode(value) for value in (payload.wardrobe_image, payload.identity_image, payload.pose_image))
        import torch
        prompt = ('Edit image 1 into the body pose in image 3. Preserve the exact person and face from image 2, '
                  'every garment, garment color, pattern, neckline and accessory from image 1. '
                  'Image 2 is only facial identity. Image 3 is a colored skeleton showing joint positions only. '
                  'Render a real clothed person, never the skeleton or its colors. Keep both legs in the exact lower-body garment from image 1. '
                  'Photorealistic full-body studio photograph, realistic anatomy, visible feet. ' + payload.pose_prompt)
        result = pipeline_for('pose')(image=[wardrobe, identity, reference], prompt=prompt,
                                      width=768, height=1024, num_inference_steps=4, guidance_scale=1.0,
                                      generator=torch.Generator(device='cuda').manual_seed(payload.seed))
        return image_response(result.images[0], 'flux-2-klein-4b')
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, 'Pose inference failed. Your previous preview is preserved; check weights and GPU memory') from exc
    finally:
        _lock.release()
