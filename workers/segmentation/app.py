"""Authenticated SAM 2.1 image worker. No uploaded files or embeddings are persisted."""
import base64
import io
import os
import secrets
import threading
from contextlib import asynccontextmanager

import numpy as np
import torch
from fastapi import FastAPI, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, ValidationError
from starlette.concurrency import run_in_threadpool
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor
from masks import choose_mask, prompt_boxes

TOKEN=os.environ.get('SEGMENTATION_TOKEN','')
DEVICE=os.environ.get('SAM2_DEVICE','auto')
if DEVICE=='auto': DEVICE='cuda' if torch.cuda.is_available() else 'cpu'
MODEL_NAME=os.environ.get('SAM2_MODEL_NAME','sam2.1-hiera-small')
CHECKPOINT=os.environ.get('SAM2_CHECKPOINT','/weights/sam2.1_hiera_small.pt')
CONFIG=os.environ.get('SAM2_CONFIG','configs/sam2.1/sam2.1_hiera_s.yaml')
Image.MAX_IMAGE_PIXELS=2_560_000
torch.set_num_threads(int(os.environ.get('SAM2_CPU_THREADS','4')))
lock=threading.Lock()
predictor=None

@asynccontextmanager
async def lifespan(app):
    global predictor
    if not TOKEN: raise RuntimeError('SEGMENTATION_TOKEN must be configured')
    predictor=SAM2ImagePredictor(build_sam2(CONFIG,CHECKPOINT,device=DEVICE,apply_postprocessing=False))
    yield
    predictor=None

app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None)

class Box(BaseModel):
    x: float=Field(ge=0,le=1,allow_inf_nan=False)
    y: float=Field(ge=0,le=1,allow_inf_nan=False)
    w: float=Field(gt=0,le=1,allow_inf_nan=False)
    h: float=Field(gt=0,le=1,allow_inf_nan=False)

class Garment(BaseModel):
    id: str=Field(min_length=1,max_length=80)
    category: str=Field(max_length=32)
    bbox: Box

class SegmentRequest(BaseModel):
    image: str=Field(max_length=11_500_000)
    garments: list[Garment]=Field(min_length=1,max_length=16)

def authenticate(request):
    if not TOKEN or not secrets.compare_digest(request.headers.get('authorization',''),f'Bearer {TOKEN}'):
        raise HTTPException(401,'Unauthorized')

@app.get('/health')
def health():
    return {'ready':predictor is not None,'model':MODEL_NAME,'device':DEVICE}

def infer(payload):
    if not lock.acquire(blocking=False): raise HTTPException(429,'Segmentation worker is busy; retry shortly')
    try:
        try:
            prefix,encoded=payload.image.split(',',1)
            if prefix not in ('data:image/webp;base64','data:image/png;base64','data:image/jpeg;base64'): raise ValueError()
            raw=base64.b64decode(encoded,validate=True)
            if len(raw)>8*1024*1024: raise ValueError()
            image=Image.open(io.BytesIO(raw))
            if image.width<64 or image.height<64 or image.width*image.height>2_560_000 or getattr(image,'n_frames',1)!=1: raise ValueError()
            image=image.convert('RGB');image.load()
        except (ValueError,UnidentifiedImageError,OSError,Image.DecompressionBombError):
            raise HTTPException(400,'Invalid normalized image') from None
        w,h=image.size
        segments=[]
        with torch.inference_mode():
            predictor.set_image(np.array(image))
            for garment in payload.garments:
                b=garment.bbox
                box=np.array([b.x*w,b.y*h,min(1,b.x+b.w)*w,min(1,b.y+b.h)*h])
                if box[2]<=box[0] or box[3]<=box[1]: continue
                masks,scores,_=predictor.predict(box=box,multimask_output=True)
                result=choose_mask(masks,scores,box)
                if result is None:
                    for alternative in prompt_boxes(box,w,h,garment.category)[1:]:
                        masks,scores,_=predictor.predict(box=alternative,multimask_output=True)
                        candidate=choose_mask(masks,scores,alternative)
                        if candidate is not None and (result is None or candidate[1]>result[1]): result=candidate
                if result is None: continue
                mask,score=result
                buf=io.BytesIO();Image.fromarray((mask*255).astype(np.uint8)).save(buf,format='PNG')
                segments.append({'id':garment.id,'mask':'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode(),'score':score})
        return {'model':MODEL_NAME,'segments':segments}
    finally:
        if predictor is not None: predictor.reset_predictor()
        lock.release()

@app.post('/segment')
async def segment(request: Request):
    authenticate(request)
    body=bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body)>12_000_000: raise HTTPException(413,'Request too large')
    try:
        payload=SegmentRequest.model_validate_json(bytes(body))
        if len({g.id for g in payload.garments})!=len(payload.garments): raise ValueError()
    except (ValidationError,ValueError): raise HTTPException(400,'Invalid segmentation request') from None
    return await run_in_threadpool(infer,payload)
