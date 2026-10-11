"""Explicit download/warmup step. Never runs as part of HTTP startup."""
import gc
import os
from pathlib import Path
from huggingface_hub import hf_hub_download, snapshot_download, model_info
import json

weights = Path(os.environ.get('FASHN_WEIGHTS_DIR', './weights'))
weights.mkdir(parents=True, exist_ok=True)
revisions = {name: model_info(name).sha for name in ('fashn-ai/fashn-vton-1.5', 'fashn-ai/DWPose', 'black-forest-labs/FLUX.2-klein-4B')}
Path('model-revisions.json').write_text(json.dumps(revisions, indent=2))
hf_hub_download('fashn-ai/fashn-vton-1.5', 'model.safetensors', local_dir=weights, revision=revisions['fashn-ai/fashn-vton-1.5'])
for filename in ('yolox_l.onnx', 'dw-ll_ucoco_384.onnx'):
    hf_hub_download('fashn-ai/DWPose', filename, local_dir=weights / 'dwpose', revision=revisions['fashn-ai/DWPose'])
# Human-parser auxiliary files download during this explicit initialization.
from fashn_vton import TryOnPipeline
pipeline = TryOnPipeline(weights_dir=str(weights), device='cuda')
del pipeline
gc.collect()
import torch
torch.cuda.empty_cache()
(weights / '.prepared').touch()
pose = Path(os.environ.get('POSE_WEIGHTS_DIR', './pose-weights'))
snapshot_download('black-forest-labs/FLUX.2-klein-4B', local_dir=pose, revision=revisions['black-forest-labs/FLUX.2-klein-4B'])
from diffusers import Flux2KleinPipeline
pipeline = Flux2KleinPipeline.from_pretrained(str(pose), torch_dtype=torch.bfloat16, local_files_only=True)
del pipeline
(pose / '.prepared').touch()
print('FASHN and FLUX model preparation complete', flush=True)
