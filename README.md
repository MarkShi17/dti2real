# DTI2IRL

Turn a game outfit screenshot into editable garments, shopping matches, and a virtual fitting room. US / USD. Built with Next.js, React, TypeScript and Sharp. Read the original requirements in [SPEC.md](SPEC.md).

## Start with Docker

Docker Desktop must be running. No API keys, local Node installation, or GPU are required for the bundled demo.

```bash
docker compose up --build -d
```

Open **http://localhost:3212**. The service binds to loopback, uses its own port, runs as a non-root user, and keeps sessions in a private named Docker volume. It does not use port 3000 on your host. The first build downloads dependencies; allow approximately 2–5 minutes.

Choose another free port if necessary:

```bash
DTI2IRL_PORT=3250 docker compose up --build -d
```

Use `docker compose logs -f web` for logs and `docker compose down` to stop. Stopping preserves the session volume. Use the app's **Delete my session** to remove your photos and renders. Container health checks call `/api/status`.

If you are using a container started manually during development (`dti2irl-app`), stop that container before starting Compose on the same port: `docker stop dti2irl-app`.

## Try the complete demo

1. Choose **Explore an example**. Five annotated garments and clearly labeled illustrative products appear.
2. Edit a garment's category, color, material, cut, query, or region; choose a product per piece. Filters are optional.
3. Choose **Try on this fit**, then each of the five poses. Switch the bottom to the **Burgundy pleated maxi skirt** and render again.
4. Use **Before / after**, render history, and **Save look**. PNG exports contain the inspiration and result; SVG cards also contain clickable shopping links. Reload to restore the session.

Demo renders support the first black knit plus either the silver or burgundy skirt, on the fictional studio model. Other combinations and uploaded person photos require live inference. Sample images are pre-rendered, not presented as live generations. Sample prices are illustrative; shopping buttons open searches, not invented retailer listings. [Asset provenance](public/demo/README.md).

## Your photo and 3D fitting room

Choose **Your photo**, confirm permission, and upload a clear full-body image. **Photo preview** stays empty until a matching try-on finishes; your upload appears separately as the selected person reference. Personal photos are never replaced by sample model renders. **3D avatar** provides continuous rotation, front/back/reset, zoom, five rigged poses (including a finger pose), body-proportion sliders, and PNG snapshots. It uses a bundled MakeHuman body, skeleton, and fitted clothing meshes.

Photo analysis runs locally in a browser worker using bundled MediaPipe models. It estimates proportions and adds face geometry adjustments and a texture from your reference. Add an optional face close-up through Your photo for better facial detail. Proportions, unseen surfaces, garment shapes, and facial likeness are approximations, not measured sizing. The avatar profile, pose, view, and face reference persist in your private session. Photo pose edits use the configured OpenAI, fal or private GPU provider; the 3D view remains usable when photo inference is unavailable. [Avatar asset provenance](public/avatar/README.md).

The 3D outfit updates when you select pieces; it does not require a photo-generation job. Tanks, long-sleeved knits, pinafore dresses, tights, and legwarmers use separate meshes so sleeves and layers are preserved. Selected listing images are loaded through a session-scoped image endpoint for clothing textures. The front uses the available reference, while unseen fabric and garment geometry remain estimates. Rotation renders in the browser, so a remote GPU does not determine its frame rate.

## Configure live services

```bash
cp .env.example .env.local
```

Runtime settings can be in `.env` or `.env.local` (`.env.local` wins). Evaluation-prefixed `ACCURACY_*` names are not runtime settings. Fill only the services you want, then recreate the container with `docker compose up -d --force-recreate`. Environment changes do not require rebuilding. No secrets are sent to the browser or copied into the image.

| Capability | Required environment variables | Behavior |
| --- | --- | --- |
| Garment recognition | `VISION_API_KEY`, `VISION_MODEL`; optionally `VISION_PROVIDER=openrouter` and `VISION_BASE_URL` | Vision-capable OpenAI-compatible chat API with strict JSON schema support. Returns garment attributes, confidence and approximate boxes. Model name is explicit; choose one supported by your provider. |
| Pixel garment masks | `SEGMENTATION_URL`, `SEGMENTATION_TOKEN` | Private, open-source SAM 2.1 worker; CPU or CUDA. Run `node scripts/configure-segmentation.mjs`, then `docker compose --profile segmentation up --build -d`. [Setup](workers/segmentation/README.md), [research and real-image findings](docs/vision-research.md). |
| Real shopping | `SERPAPI_KEY` | Google Shopping results through SerpApi. Uses returned listing links, thumbnails, prices and merchants. |
| Optional eBay | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Production OAuth application token and Browse API. Requires approved eBay API access; US marketplace. |
| Image similarity review | `VISUAL_RERANK=true` plus vision settings | Compares screenshot/crop with up to six candidate product images per garment, combining visual scores with attribute ranking. Additional API calls apply. |
| Complete outfit and reviewed photo poses | `TRYON_PROVIDER=openai_outfit`, `POSE_PROVIDER=openai_outfit`, `OPENAI_API_KEY`, separately configured `VISION_API_KEY`, `VISION_MODEL=gpt-5.4` | Direct GPT-Image-2.5 Sunburst edits at `quality=max`, one `1024x1536` portrait. GPT-5.4 analyzes source layering and reviews each candidate, with at most two targeted repair edits. Every visible piece requires a real product. |
| Hosted try-on | `FASHN_API_KEY` | FASHN `tryon-v1.6`; uses the actual selected product images and studio or uploaded person. |
| Own GPU try-on | `TRYON_PROVIDER=fashn_local`, `FASHN_LOCAL_URL`, `FASHN_LOCAL_TOKEN` | Separate authenticated [FASHN VTON 1.5 worker](workers/fashn-local/README.md). Explicit model installation/download; optional [dedicated AWS lease setup](workers/fashn-local/README.md) with verified 24-hour auto-termination. |
| Private GPU pose editing | `POSE_PROVIDER=flux_local`, `POSE_LOCAL_URL`, `POSE_LOCAL_TOKEN`, `GPU_EXPIRES_AT` | Local FLUX.2-klein-4B; three references, shared GPU lock, previous preview preserved on failure. |
| Live pose editing | `POSE_API_KEY` (fal key); optional `POSE_MODEL` | Default `fal-ai/flux-2/klein/9b/edit`. Uses current outfit, identity reference, and pose reference. |

Other settings are documented in [.env.example](.env.example):

- `DEMO_MODE=true` explicitly forces all services to demo. Otherwise each service selects its available credentials independently. A selected but misconfigured provider reports an error, rather than silently using sample results.
- `IMAGE_ALLOWED_HOSTS` adds exact trusted image domains (including their subdomains) for product/output downloads. Private IPs, unsafe protocols and redirects remain blocked. Add only the merchant/CDN domains you trust when a real listing's image is rejected.
- `PUBLIC_ORIGIN` is the exact public origin when deploying behind HTTPS, e.g. `https://wardrobe.example.com`.
- `DATA_DIR` chooses private session storage outside Docker. Docker sets `/app/.data`.
- `DTI2IRL_PORT` selects the host port. For Compose substitution set it in the shell or a `.env` file; `.env.local` configures the application services.

The header distinguishes demo, configured and unavailable providers. Local GPU readiness also checks authenticated worker health, CUDA, model preparation, and lease expiry; a URL alone does not enable photo generation. Real vision, CPU SAM 2.1 inference and Google Shopping calls have been exercised on `fit10`. The complete-outfit pipeline has separate [validation and live comparison records](docs/outfit-pipeline.md); fixtures do not establish clothing fidelity or comparative superiority. See [vision findings](docs/vision-research.md). Supplying keys can incur charges when you analyze, search, render, or pose; generation submissions are not automatically retried after ambiguous network failures.

## What works and what is limited

| Area | Implemented | Limits |
| --- | --- | --- |
| Inspiration | PNG/JPEG/WebP upload, content decoding, EXIF removal, instant preview, rotation/crop, labeled garment crops, manual garment addition/hiding, region drawing and keyboard coordinates | 8 MB / 24 megapixels, up to 16 garments. Images are normalized to at most 1600px; full-resolution source bytes are not kept. Without the SAM worker, automatic regions are approximate boxes. With it, accepted masks show actual silhouettes; uncertain pieces retain editable boxes. One real screenshot was exercised; broad Roblox accuracy has not been measured. |
| Discovery | Multiple descriptor queries, Google Shopping/eBay normalization, per-garment selection, independent re-search, optional budget/source/used filters, Depop search links | Default ranking uses attributes/keywords. Actual image comparison requires `VISUAL_RERANK`. No Depop scraping; no stock/size guarantees. A price cap excludes unknown/non-USD prices. |
| Wardrobe | Consent-gated person/face upload, default adult model, async jobs, complete outfit generation, validated layering, per-product quality review, two targeted repairs, retries, deduplication, history and stale-render protection | `openai_outfit` includes all visible pieces, including repeated categories and accessories. Legacy FASHN adapters retain dress or bottom/top composition. AI review reduces glitches but does not guarantee exact product details, identity or physical fit. |
| Poses/export | Five distinct bundled full-body poses for both sample outfits, live pose adapter, compare slider, PNG/SVG cards | Uploaded photos preserve their original pose unless live pose editing is configured. AI edits can change identity or garment details; previews do not measure size or fit. |
| Persistence | HttpOnly session cookie, private filesystem storage, scoped image access, autosave/reload, deletion and 24-hour expiry | Single-process local MVP. No account sync, multi-instance storage, durable distributed job queue, or public-service abuse prevention. |

User images are stored outside `public/` and never put in localStorage. A maximum of 100 image files is allowed per session. Expired sessions become inaccessible after 24 hours; physical files are cleaned when another session starts or by `node scripts/cleanup.mjs`. Schedule that cleanup for unattended hosting. Deleting a session removes local data immediately, including cached images. Deletion does not cancel an already-submitted provider job or remove provider-held data; external retention is governed by that provider. Filesystem permissions provide local access control; this app does not add encryption at rest.

## Development and verification

Node 22+:

```bash
npm ci
npm run dev -- --port 3212
```

Production without Docker: `npm run build`, then `npm run start -- --port 3212`.
Minimal Linux hosts also need Fontconfig and fonts (Debian/Ubuntu: `fontconfig fonts-dejavu-core`) for readable PNG export labels. The Docker image includes them.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run the comprehensive suite in Docker (no credentials, GPU, or free host ports required):

```bash
npm run test:e2e:docker
```

The suite contains 151 cases: 31 browser workflows on desktop Chrome, mobile Chromium, Firefox and mobile WebKit; 12 real HTTP/security cases; and 15 provider-integration cases, including mask display/persistence, manual correction and worker failure. It covers uploads, manual edits, product selection, five distinct poses, actual PNG/SVG downloads, persistence, consent, session isolation, malformed requests, rate limits, provider failures and deliberately delayed responses. Production provider adapters execute against explicit external-service fixtures with fake keys; no paid inference or real shopping calls occur. See the [coverage matrix and test commands](docs/testing.md).

Reports appear in `playwright-report/` and `test-results/`, with screenshots and failure traces. Open the report with `npx playwright show-report`. The GitHub Actions workflow runs the same checks and retains artifacts. See [verification notes](docs/verification.md) for results actually observed; automated fixtures do not establish model accuracy or real provider availability.

## Deployment

Use a persistent Docker host for this version. Build the image, keep one application replica, mount `/app/.data`, inject `.env.local`, and put an HTTPS reverse proxy in front of the loopback port. Set `PUBLIC_ORIGIN` to the external origin. Preserve the volume across deployments and schedule `docker compose exec -T web node scripts/cleanup.mjs` hourly. Keep a GPU worker private; the worker guide includes SSH tunneling.

The app records job state on disk but executes jobs in-process using Next.js `after()`. A container restart interrupts work; jobs expire after a twenty-minute budget. Image calls have three-minute timeouts and layering/review calls have two-minute timeouts. A timed-out image submission may still incur a charge and is never automatically resubmitted. Accepted outfit and layering caches can be reused. This version requires a persistent Node/Docker process: an exported `maxDuration=1200` does not override a hosting platform's own invocation limit. It should not be deployed unchanged to an ephemeral filesystem or multiple application replicas. For public hosting add authentication/spending limits, shared storage and a durable queue first.

For a future Vercel adaptation, the Vercel CLI is not installed in this environment; installing it with `npm i -g vercel` enables environment, deployment and log commands. The storage/queue adaptation above is still required before that deployment.

## Architecture and provider references

`src/components` contains the workbench; `src/state/wardrobe.tsx` coordinates client operations. `src/lib/providers` implements vision, shopping, visual comparison, try-on and pose boundaries. `src/lib/jobs.ts` owns composition/caching; `src/lib/storage.ts` owns private sessions. `workers/fashn-local` is the optional try-on service; `workers/segmentation` runs SAM 2.1 on CPU or CUDA.

API routes: `/api/status`, `/api/session`, `/api/upload`, `/api/assets/[id]`, `/api/analyze`, `/api/segment`, `/api/search`, `/api/tryon`, `/api/pose`, `/api/jobs/[id]`, `/api/export`. Mutation routes require the session and same-origin requests; keys and provider fetches remain on the server. Status is intentionally public and contains no secret values.

Provider implementations follow [FASHN hosted docs](https://docs.fashn.ai/api-reference/tryon-v1-6), [FASHN open-source code](https://github.com/fashn-AI/fashn-vton-1.5), [fal model API](https://fal.ai/models/fal-ai/flux-2/klein/9b/edit/api), [SerpApi Shopping docs](https://serpapi.com/google-shopping-api), [eBay Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html), and [OpenRouter structured outputs](https://openrouter.ai/docs/features/structured-outputs). Check provider/model access and upstream licenses for your deployment. This project is independent of Roblox and Dress to Impress.
