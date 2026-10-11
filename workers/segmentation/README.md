# Private SAM 2.1 garment worker

This worker turns garment bounding boxes into real pixel masks using Meta's **SAM 2.1 Hiera Small**, with the official Apache-2.0 code and checkpoint. It runs on CPU by default. No account, rented GPU, or segmentation API key is needed. The application's vision provider identifies clothing and supplies initial boxes; SAM does not name the garments.

## Start with the app

1. Configure `VISION_API_KEY`, `VISION_MODEL`, and your provider's `VISION_BASE_URL` in the ignored `.env.local`.
2. Run `node scripts/configure-segmentation.mjs`. This preserves existing settings and creates a random shared token in `.env.local` and `.env.segmentation`.
3. Run `docker compose --profile segmentation up --build -d` and open http://localhost:3212.

The first worker build downloads PyTorch and a ~184 MB checkpoint. Subsequent starts reuse the built image. The worker is reachable only on the Compose network; no host port is published. `SEGMENTATION_URL=http://segmentation:8000` belongs in the app's environment. Both services need the same `SEGMENTATION_TOKEN`; do not paste it into the browser or commit it. The container runs as an unprivileged user. Only normalized screenshots are sent, and source images/embeddings are not persisted by the worker.

If manually launched development containers occupy these names/ports, stop `dti2irl-app` and `dti2irl-segmentation` before switching to Compose. The manually launched app uses `http://host.docker.internal:3213` to reach the worker; that override is unnecessary in Compose.

## Behavior and corrections

`POST /segment` accepts an image data URI and up to 16 `{id, category, bbox}` prompts. Authentication is `Authorization: Bearer <token>`. The reply contains PNG binary masks, IDs, model name, and estimated mask quality. Images are limited to 8 MB / 2.56 MP. Input bytes, masks and credentials are not logged. Concurrent inference returns 429 instead of sharing mutable predictor state.

Each screenshot is encoded once. For uncertain boxes, bounded relative shifts are tried using the same embedding, except for jewelry where this can select nearby skin. Masks below 0.8 estimated quality, empty masks, and excessive background spill are discarded; tiny isolated components are removed without merging separate shoes. These thresholds are heuristics, not calibrated accuracy probabilities. There is no guarantee that a high-scoring mask identifies the intended garment.

The app stores accepted transparent cutouts as private session assets, uses their alpha channels for overlays, and uses them for visual reranking when `VISUAL_RERANK=true`. Uncertain pieces retain editable boxes. The application skips jewelry masks entirely because even high-scoring results can incorrectly select skin; jewelry stays as a manual region. Redrawing a region removes its stale mask. **Edit piece → Refine garment mask** runs SAM again without another vision API call.

## GPU option

CPU inference was exercised on Docker Desktop. GPU execution has not been exercised here. For an NVIDIA host with NVIDIA Container Toolkit, build using the CUDA wheels:

```sh
docker build --build-arg TORCH_INDEX=https://download.pytorch.org/whl/cu128 -t dti2irl:segmentation-gpu workers/segmentation
docker run --rm --gpus all --env-file .env.segmentation -p 127.0.0.1:3213:8000 dti2irl:segmentation-gpu
```

`SAM2_DEVICE=auto` selects CUDA if available. A larger official checkpoint can be mounted with `SAM2_CHECKPOINT`, matching `SAM2_CONFIG`, and `SAM2_MODEL_NAME`; it is not automatically downloaded. Keep the service private and use TLS or an SSH tunnel for a remote worker. Set the application URL to that private endpoint. An H100/B300 is unnecessary for the tested small-model CPU path.

## Verification and sources

The Docker build runs five tests of mask rejection, component cleanup and bounded prompts. Run them again with `docker run --rm dti2irl:segmentation python -m unittest -v test_masks`.

The official source is pinned to commit `2b90b9f5ceec907a1c18123530e92e794ad901a4`. The downloaded checkpoint's SHA-256 is checked during build. See [Meta SAM 2](https://github.com/facebookresearch/sam2), its [license](https://github.com/facebookresearch/sam2/blob/main/LICENSE), and the [research/evaluation notes](../../docs/vision-research.md).
