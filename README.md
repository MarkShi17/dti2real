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

## Configure live services

```bash
cp .env.example .env.local
```

Fill only the services you want, then recreate the container with `docker compose up -d --force-recreate`. Environment changes do not require rebuilding. No secrets are sent to the browser or copied into the image.

| Capability | Required environment variables | Behavior |
| --- | --- | --- |
| Garment recognition | `VISION_API_KEY`, `VISION_MODEL`; optionally `VISION_PROVIDER=openrouter` and `VISION_BASE_URL` | Vision-capable OpenAI-compatible chat API with strict JSON schema support. Returns garment attributes, confidence and approximate boxes. Model name is explicit; choose one supported by your provider. |
| Real shopping | `SERPAPI_KEY` | Google Shopping results through SerpApi. Uses returned listing links, thumbnails, prices and merchants. |
| Optional eBay | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Production OAuth application token and Browse API. Requires approved eBay API access; US marketplace. |
| Image similarity review | `VISUAL_RERANK=true` plus vision settings | Compares screenshot/crop with up to six candidate product images per garment, combining visual scores with attribute ranking. Additional API calls apply. |
| Hosted try-on | `FASHN_API_KEY` | FASHN `tryon-v1.6`; uses the actual selected product images and studio or uploaded person. |
| Own GPU try-on | `TRYON_PROVIDER=fashn_local`, `FASHN_LOCAL_URL`, `FASHN_LOCAL_TOKEN` | Separate authenticated [FASHN VTON 1.5 worker](workers/fashn-local/README.md). Explicit model installation/download; nothing is provisioned automatically. |
| Live pose editing | `POSE_API_KEY` (fal key); optional `POSE_MODEL` | Default `fal-ai/flux-2/klein/9b/edit`. Uses current outfit, identity reference, and pose reference. |

Other settings are documented in [.env.example](.env.example):

- `DEMO_MODE=true` explicitly forces all services to demo. Otherwise each service selects its available credentials independently. A selected but misconfigured provider reports an error, rather than silently using sample results.
- `IMAGE_ALLOWED_HOSTS` adds exact trusted image domains (including their subdomains) for product/output downloads. Private IPs, unsafe protocols and redirects remain blocked. Add only the merchant/CDN domains you trust when a real listing's image is rejected.
- `PUBLIC_ORIGIN` is the exact public origin when deploying behind HTTPS, e.g. `https://wardrobe.example.com`.
- `DATA_DIR` chooses private session storage outside Docker. Docker sets `/app/.data`.
- `DTI2IRL_PORT` selects the host port. For Compose substitution set it in the shell or a `.env` file; `.env.local` configures the application services.

The header distinguishes demo, configured and unavailable providers. “Configured” only means credentials are present. No paid provider calls or GPU inference were performed while building this MVP. Supplying keys can incur charges when you analyze, search, render, or pose; generation submissions are not automatically retried after ambiguous network failures.

## What works and what is limited

| Area | Implemented | Limits |
| --- | --- | --- |
| Inspiration | PNG/JPEG/WebP upload, content decoding, EXIF removal, instant preview, rotation/crop, labeled garment crops, manual garment addition/hiding, region drawing and keyboard coordinates | 8 MB / 24 megapixels, up to 16 garments. Images are normalized to at most 1600px; full-resolution source bytes are not kept. Automatic boxes are approximate, not segmentation masks. Real Roblox recognition accuracy has not been benchmarked. |
| Discovery | Multiple descriptor queries, Google Shopping/eBay normalization, per-garment selection, independent re-search, optional budget/source/used filters, Depop search links | Default ranking uses attributes/keywords. Actual image comparison requires `VISUAL_RERANK`. No Depop scraping; no stock/size guarantees. A price cap excludes unknown/non-USD prices. |
| Wardrobe | Consent-gated person upload, default adult model, async jobs, progress, errors, per-garment retry, full regenerate, deduplication, history, stale-render protection, intermediate caching | Live model renders a dress, or bottoms then top. Shoes, outerwear, bags, jewelry and other accessories remain shopping references. Sequential inference can alter previously rendered details. |
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

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Start the app, then run browser tests:

```bash
npx playwright install chromium
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3212 npm run test:e2e
```

The suite covers desktop and phone layouts, manual edits, independent product selection, five distinct poses, exports, persistence, consent, provider-unavailable errors, and deletion. Server tests cover session isolation, malicious URLs, query/ranking logic, malformed providers, job deduplication, composition order, partial-failure retries and cache invalidation. Live adapters use mocked service responses in tests, which do not establish real provider availability or model quality.

Browser screenshots are generated in `docs/desktop-studio.png` and `docs/mobile-studio.png`. See [verification notes](docs/verification.md) for the checks actually executed.

## Deployment

Use a persistent Docker host for this version. Build the image, keep one application replica, mount `/app/.data`, inject `.env.local`, and put an HTTPS reverse proxy in front of the loopback port. Set `PUBLIC_ORIGIN` to the external origin. Preserve the volume across deployments and schedule `docker compose exec -T web node scripts/cleanup.mjs` hourly. Keep a GPU worker private; the worker guide includes SSH tunneling.

The app records job state on disk but executes jobs in-process using Next.js `after()`. A container restart interrupts work; jobs become retryable after the ten-minute interruption timeout. Completed layer caches can be reused. This version should not be deployed unchanged to an ephemeral filesystem or multiple application replicas. For public hosting add authentication/spending limits, shared storage and a durable queue first.

For a future Vercel adaptation, the Vercel CLI is not installed in this environment; installing it with `npm i -g vercel` enables environment, deployment and log commands. The storage/queue adaptation above is still required before that deployment.

## Architecture and provider references

`src/components` contains the workbench; `src/state/wardrobe.tsx` coordinates client operations. `src/lib/providers` implements vision, shopping, visual comparison, try-on and pose boundaries. `src/lib/jobs.ts` owns composition/caching; `src/lib/storage.ts` owns private sessions. `workers/fashn-local` is the optional Python/CUDA service.

API routes: `/api/status`, `/api/session`, `/api/upload`, `/api/assets/[id]`, `/api/analyze`, `/api/search`, `/api/tryon`, `/api/pose`, `/api/jobs/[id]`, `/api/export`. Mutation routes require the session and same-origin requests; keys and provider fetches remain on the server. Status is intentionally public and contains no secret values.

Provider implementations follow [FASHN hosted docs](https://docs.fashn.ai/api-reference/tryon-v1-6), [FASHN open-source code](https://github.com/fashn-AI/fashn-vton-1.5), [fal model API](https://fal.ai/models/fal-ai/flux-2/klein/9b/edit/api), [SerpApi Shopping docs](https://serpapi.com/google-shopping-api), [eBay Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html), and [OpenRouter structured outputs](https://openrouter.ai/docs/features/structured-outputs). Check provider/model access and upstream licenses for your deployment. This project is independent of Roblox and Dress to Impress.
