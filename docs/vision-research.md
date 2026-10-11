# Garment recognition and segmentation research

Research date: 2026-10-11. Target: stylized Dress to Impress / Roblox screenshots, starting with the user-supplied `docs/dti_example/fit10.webp`.

## Decision

Use two stages: a vision-language model identifies independently shoppable pieces and descriptions; **SAM 2.1** turns approximate regions into pixel masks. The existing compatible vision credentials have been mapped from `.env`'s evaluation variables into ignored `.env.local` runtime variables. The configured model is `gpt-5.4` on the user's existing compatible endpoint. This labeler is hosted, not open source. The segmentation model is open source and executes locally on CPU in Docker. No GPU instance was provisioned.

A general vision-language response containing boxes is not segmentation. The previous application only returned boxes and was running in demo mode because its runtime credentials were not loaded. Passing fixture-backed end-to-end tests never demonstrated recognition quality on arbitrary screenshots.

## Models considered

| Model / pipeline | Suitable role | Trade-off and decision |
| --- | --- | --- |
| [Meta SAM 2.1](https://github.com/facebookresearch/sam2) | Pixel masks prompted by boxes/points; Apache-2.0 code and checkpoints | **Implemented and executed.** Small checkpoint runs on CPU, with no gated download. Needs a separate labeler and can select the wrong object when the box is inaccurate. |
| [Meta SAM 3](https://github.com/facebookresearch/sam3) | Segmentation prompted by garment names, boxes, or examples | Strong next candidate to benchmark because it understands text concepts. It uses a custom SAM license, gated weights, and its official setup specifies a CUDA GPU. Public benchmark results do not establish DTI clothing accuracy. Not deployed or tested in this session. [Hosted fal endpoint](https://fal.ai/models/fal-ai/sam-3/image/api) is available with a separate key. |
| [Qwen3-VL-8B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct) | Open-source garment identification, attribute extraction, and visual grounding; Apache-2.0 | A route to replacing the hosted labeler with an open-source one. The official model card documents vLLM's compatible chat API. It does not itself supply pixel masks in the current app. Not downloaded or tested here. |
| [Grounded SAM 2](https://github.com/IDEA-Research/Grounded-SAM-2) | Grounding DINO or Florence-2 locates named objects, SAM produces masks | Useful fully open model pipeline for comparison. Adds another detector/model to operate. Not assumed superior to the configured labeler on stylized game clothing without an evaluation. |

The recommendation of SAM 3 as a next benchmark is an engineering inference from its text-conditioned interface, not a claim that it outperforms SAM 2.1 on these screenshots. No reviewed source established a Roblox/DTI garment-specific accuracy guarantee. Model quality needs to be judged on the user's examples.

## Implementation

`/api/analyze` calls the configured labeler, validates garment descriptions, then calls the private SAM worker. The worker encodes the image once and decodes a mask for each prompt. When an initial box fails, it tests a small set of bounded box shifts using the same embedding. The application excludes jewelry from automatic masks and leaves it as editable regions: SAM sometimes selects nearby skin even above the score threshold. Predicted mask quality must be at least 0.8 in the worker. It also rejects empty/full-image masks and excessive spill outside the region, and removes tiny disconnected specks. These are heuristics; a model confidence score is not measured pixel accuracy.

Accepted masks become transparent cutouts stored behind session-authenticated asset routes. The browser shows their silhouettes on the source and uses them in garment thumbnails. Redrawing the region clears its old mask. **Refine garment mask** runs SAM with a corrected region without paying for a new vision analysis. Failed or uncertain masks leave editable boxes and an explicit explanation. If visual ranking is enabled, it uses the private cutout alongside the full screenshot.

## Observed quality and limitations

A first real vision call recognized a white camisole, light-wash cropped jeans, white sneakers, and jewelry in `fit10` in 14.8 seconds. The first SAM probe produced useful garment masks for the top, jeans and both shoes in 4.2 seconds on CPU. Jewelry masks were wrong and received low scores. A second vision response shifted the top box; its first SAM result failed. Testing nearby box prompts recovered the top, motivating the bounded-prompt recovery in the worker. This is real model execution, not a mocked response.

A final fresh upload on the updated production image recognized six pieces and returned three private masks (top, jeans, shoes) in 34.2 seconds including upload, vision and segmentation. Jewelry remained as editable regions. The reproducible evaluation script executed successfully, verified that unauthenticated mask access returns 401, and deleted its temporary session. [Actual cutout comparison](fit10-masks.png) · [Final evaluation JSON](vision-evaluation.json).

Thin straps, tiny jewelry, occluded edges, overlapping layers, and uncertain garment grouping remain limitations. Some cutouts can retain small skin/background fragments. There is no pixel-level ground-truth annotation yet, so **no IoU, accuracy percentage, or “works on any image” claim is justified**. Scores labeled `estimatedMaskScore` are the model's predictions only. Repeatability across many different outfits is not established by this one-image smoke evaluation.

The actual browser journey retrieved 60 non-demo listings across five recognized pieces, rendered masks, restored state after reload, and passed a 375px layout check without JavaScript errors. The top six camisole candidates received real image-based ranking. Later ranking calls returned HTTP 402 and correctly fell back to labeled keyword matches. A subsequent recognition request and an eight-image diagnostic both succeeded; intermittent provider availability or billing failures remain possible. The provider [documents 402 for insufficient balance](https://www.cheaperinference.com/docs); account balance was not independently verified. A separate camisole probe returned 12 non-demo listings. They are candidates, not guaranteed visual matches or current stock. Depop remains an explicitly labeled external search; this work does not add an authorized Depop inventory API. Try-on and pose services remain separately configured capabilities.

## Reproduce a live evaluation

Start the configured app and worker using the [worker guide](../workers/segmentation/README.md). The following creates a separate temporary session, uploads the supplied screenshot, calls real providers, downloads private cutouts, and deletes the session. It can incur charges on your configured vision/shopping service:

```sh
LIVE_EVALUATION=1 node scripts/evaluate-vision.mjs docs/dti_example/fit10.webp
```

Set `EVALUATE_SHOPPING=1` to test one garment's real retrieval as well. `EVALUATION_BASE_URL` defaults to `http://127.0.0.1:3212`; `EVALUATION_OUTPUT` defaults to ignored `.cache/live-vision`. Inspect the saved cutouts; the script verifies transport and privacy, not subjective match quality.

For a defensible accuracy benchmark, annotate visible garment masks and categories across the example set, including hard layered looks, then measure per-category recall, mask IoU and correction rate. Compare the current pipeline against Qwen3-VL + SAM 2.1 and SAM 3 on the same held-out examples before choosing a GPU or fine-tuning.

## Fully open labeler option

The official Qwen model card documents `vllm serve Qwen/Qwen3-VL-8B-Instruct`. On a private GPU host, serve that model with authentication, then configure `VISION_PROVIDER=openai_compatible`, `VISION_MODEL=Qwen/Qwen3-VL-8B-Instruct`, `VISION_BASE_URL=<your-private-endpoint>/v1`, and `VISION_API_KEY=<your-server-token>`. Keep strict JSON-schema output support enabled. This uses the existing adapter; Qwen-specific output quality and GPU sizing have not been verified here.
