# DTI2IRL — Codex MVP Build Specification

**One-line pitch:** Upload a Dress to Impress / Roblox outfit screenshot, identify its individual garments, find real products that recreate the look, and try those products on a virtual model or yourself in selectable runway-style poses.

**Build objective:** A genuinely working, polished, responsive web MVP. Prioritize (1) garment recognition, (2) live product retrieval and selection, (3) virtual try-on / wardrobe, and (4) DTI-style pose switching. Price and thrift are *filters*, not separate product workflows.

**Scope:** Single-player, single screenshot per session, static pose-specific images (not animated 3D or physically simulated cloth). No sign-in required for MVP. Do not scrape Roblox or Depop, and do not train models from scratch.

## 0. Instructions for the implementing agent

Implement the full application end-to-end in this repository; do not stop after scaffolding or a design mockup. Make reasonable implementation choices without asking clarifying questions. Inspect existing files before modifying anything. Use up-to-date, documented SDK signatures and install compatible versions. Keep all external services behind typed provider interfaces; include a conspicuously labeled DEMO MODE that works without keys, plus real integration paths that activate when credentials are configured. Never quietly pretend fixture products, renders, prices, or URLs are live results. Run lint, typecheck, tests, and a browser smoke test; fix errors before declaring completion. Report what genuinely works, what needs credentials/GPU, and what remains best-effort.

## 1. Product flow and UX

1. **Upload** — Drag/drop or select a screenshot showing one main DTI avatar. Show instant screenshot preview, crop/rotate if needed, and an example screenshot option.
2. **Break down** — Analyze screenshot. Display independently selectable garment chips/cards: e.g., corset, skirt, jacket, stockings, heels, bag. Show cropped region or mask overlay on the screenshot. Let the user rename a garment, change category/color/keywords, hide incorrectly detected pieces, and re-run search for that piece. If segmentation masks are unavailable, use accurate bounding boxes and labeled crops; never call rough crops pixel-perfect masks.
3. **Find the fit** — For each garment, retrieve real purchasable listings with photo, title, source, price if available, and an actual clickable listing URL. Rank by visual/style fidelity first. Show 3–6 candidates per primary garment, allow selection and replacement. Do not invent listings. When no good results exist, display 'No close match found' and manual search/edit options.
4. **Assemble** — Build a selected outfit (top + bottom OR dress, optional layer, accessories/shoes). Show a summary of chosen pieces, matched aesthetic, and editable alternatives. Budget/price slider, marketplace, thrift-only, and sort filters sit in a collapsed Filters panel; they must not dominate the experience.
5. **Virtual wardrobe** — Choose a default fictional studio model OR upload a consenting user's photo. Render selected real garments onto this person. Allow switching garments with thumbnails and regenerate only affected previews. Provide an unmistakable original-vs-IRL comparison.
6. **Pose studio** — Pose rail with 5 presets: Neutral runway, Hand on hip, Peace sign, Over-the-shoulder, Dramatic lean. Clicking a pose shows a real generated/curated result for that outfit/person/pose, not a CSS-rotated image. Cache outputs; indicate rendering state. The output is a new 2D image, not a realtime 3D rig or physically precise body-fit simulation. Preserve recognizable face/body and clothing as far as models permit. If an uploaded-photo pose edit isn't available, clearly say so and let the user keep trying on clothes in the photo's existing pose; never misrepresent a pose as changed.
7. **Share** — Download an image card containing the original screenshot, virtual try-on result, selected pose, and attribution/links to chosen real products. Avoid product price claims that cannot be verified.

### Interface design
- Fashion editorial aesthetic with subtle Y2K/game inspiration; rich charcoal, warm off-white, electric pink/lilac accent. Avoid copying Roblox/DTI branding or using its logo as app branding.
- Hero: **"Your DTI fit, IRL."** Subtitle: **"Screenshot it. Shop it. Wear it."**
- Desktop main workbench: left original screenshot + detected items, center selected products and wardrobe inventory, right large 3:4 model/try-on view and pose carousel. Mobile stacks into step-by-step panels with a sticky next action.
- Core states: upload, analyzing, editing detected pieces, searching, selecting, rendering, pose rendering, saved, provider error, no matches.
- Nice microinteractions: skeleton previews, smooth panel transitions, pose-chip highlights, image compare slider. Accessibility: keyboard navigation, labels, sensible contrast, reduced motion support.

## 2. Scope and success criteria

**P0 — Must work:** screenshot upload; VLM extraction of garment list and approximate regions; manual correction; live product lookup for each primary garment; selectable real listings; model photo or upload; working virtual try-on for tops/bottoms/dresses; at least three demonstrable pose choices with distinct visuals for a bundled fictional model; share/download result; functional filters; errors and loading states.

**P1 — Should work if the model/provider allows:** all five poses, pose editing for user-uploaded photos, sequential layering of outerwear, styling accessories in rendered image, semantic image-based reranking, cached render history.

**Not in MVP:** physically accurate fabric dynamics, manufacturing/sewing patterns, animated avatars, 3D avatar mesh, body-measurement sizing recommendations, accounts/social feed, checkout, scraping marketplaces, exact dupes guarantee, automatic size availability guarantees.

**Acceptance tests:**
- Upload one bundled sample DTI outfit screenshot: output 3–8 editable detected items in useful categories, with screenshot bbox overlays; process real user uploads with a configured vision key.
- With live shopping credentials, return valid *actual* listing URLs and candidate images for at least three major garments when matches exist; never output fabricated prices/links. Without credentials, clearly mark all fixtures as DEMO.
- Select a different skirt: wardrobe selection persists and newly requested rendering changes appropriately; do not rerun image analysis.
- Try on a top or dress on a provided model image; show an actual returned image with provider name and a truthful note that sizing/drape are approximations.
- Pose picker changes the displayed full-body composition across at least three distinct pose assets/results in the bundled demo. With a configured pose provider, switching pose starts a genuine pose-edit request and caches the result.
- Filters for max price, source, and secondhand work on listing data; unspecified prices are not falsely set to zero or included under a capped price.
- On missing API keys or model failures, the app remains navigable and transparently explains demo/fallback limits.

## 3. Architecture and stack

**Recommended:** Next.js (App Router) + TypeScript + React + Tailwind CSS + shadcn/ui + Zod + TanStack Query + lightweight state store (Zustand or React context). Use server-side Next.js route handlers for integration endpoints; use filesystem/SQLite in local dev for small session/cache storage and object storage adapter for deploy. For unit tests use Vitest; browser smoke tests Playwright. Keep secrets server-side.

**Provider interfaces:**
- `VisionProvider.analyzeOutfit(image)` -> structured `Garment[]` with categories, descriptors, optional bounding box, confidence.
- `ShoppingProvider.searchGarment(garment, filters)` -> normalized `ProductListing[]` with verified source, direct URL, image, optional price, condition.
- `TryOnProvider.render({personImage, garmentImage, category, optionalPreviousImage})` -> image + job status.
- `PoseProvider.render({wardrobeImage, identityReference, posePresetReference, posePrompt})` -> new pose-specific image + metadata.
- `StorageProvider` -> temporary private image storage and saved result retrieval.

Feature flags/env: `VISION_PROVIDER`, `VISION_MODEL`, `VISION_API_KEY`, `SERPAPI_KEY`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `TRYON_PROVIDER`, `FASHN_API_KEY`, `FASHN_LOCAL_URL`, `POSE_PROVIDER`, `POSE_MODEL`, `POSE_API_KEY`, `DEMO_MODE`. Include `.env.example`; never put tokens in client bundles. Do not assume access to an arbitrary AI provider solely because the Codex developer uses it.

**Suggested project structure:**

```text
src/app/{page.tsx,api/analyze/route.ts,api/search/route.ts,
         api/tryon/route.ts,api/pose/route.ts,api/export/route.ts}
src/components/{UploadZone,OutfitCanvas,GarmentCard,ProductGrid,
                FiltersDrawer,WardrobeStage,PosePicker,CompareSlider}.tsx
src/lib/{schema,ranking,cache,security,images,fixtures}.ts
src/lib/providers/{vision,shopping,tryon,pose}/...
src/state/wardrobe.ts
public/demo/{sample-outfits,studio-models,pose-references,pose-renders}/...
workers/fashn-local/{app.py,requirements.txt,README.md}
tests/{unit,e2e}/...
README.md  .env.example
```

## 4. Garment parsing and segmentation

Input: one screenshot (PNG/JPEG/WebP), with client-side preview and server-side dimension/file-size/type validation. Resize a copy for analysis while retaining original resolution and image-to-bbox coordinate mapping.

Use a multimodal VLM with constrained/JSON-schema output (model via `VISION_MODEL`). Extract items in visual stacking order and do *not* confuse game UI with clothes. Normalize categories: `top`, `bottom`, `dress`, `outerwear`, `hosiery`, `shoes`, `bag`, `headwear`, `jewelry`, `other`.

For each item:

```ts
type Garment = {
  id: string; name: string; category: GarmentCategory;
  attributes: { color: string[]; material?: string; silhouette?: string;
    pattern?: string; aesthetic?: string[]; details?: string[] };
  bbox?: { x: number; y: number; w: number; h: number }; // normalized 0..1
  confidence: number; searchQueries: string[]; visible: boolean;
};
```

Make the VLM return bounding boxes when possible. Validate and clamp bounds; draw clickable region overlays, crop thumbnail previews. Masks via SAM 2 are optional enhancement, NOT required for core extraction; stylized overlapping Roblox garments often produce unreliable pixel masks. Provide manual category/name/keyword edits and allow the user to choose a region from the screenshot. Maintain item stable IDs through edits.

## 5. Shopping and matching

**Primary integration:** SerpApi Google Shopping (`engine=google_shopping`, search via `q`); use returned `shopping_results`, product titles, thumbnails, seller/source, prices and real links. Validate supported link fields (`link`, `product_link`) before showing 'View item'; never synthesize a listing URL from an item name.

**Secondary:** eBay Browse API (`item_summary/search` with application OAuth token); useful for thrift/secondhand items. Respect applicable access/eligibility requirements. Implement provider as optional; missing credentials must not break normal search.

**Depop:** Offer a labeled **"Search Depop"** external link using the official public user-facing search experience, only after verifying the URL form; do NOT scrape Depop pages or use its private partner API without access. Do not present Depop listings, live price or stock in your own cards unless provided by an authorized API.

For a piece, generate 2–4 specific queries, e.g. `black lace corset bustier square neck`, not `Dress to Impress black top`. Query clothing type + silhouette + color + texture, not just generic style words. Fetch concurrently with rate limits and backoff. Dedupe by canonical link/product ID. Rank in two stages:
1. Hard/soft filters: category, color, silhouette, material, pattern, style tags, price/source/condition if selected.
2. For top candidates, optional vision similarity review of product photo vs. screenshot crop **in context**; combine item similarity and whole-outfit coherence. Example weights: category 30%, silhouette 25%, color 20%, material/pattern 15%, aesthetic 10%. Weights are initial heuristics, not learned evaluation metrics.

Prefer faithful outfit matches, not the cheapest item. Filter controls: `priceMax`, `marketplaces[]`, `secondhandOnly`, `sortBy` (`best_match`, `price_low`, `price_high`). A product without price can appear in unfiltered results with 'Price unavailable', but never falsely pass a max-price filter. For all live prices show a retrieval timestamp; links may expire or sell out.

Select exactly one candidate per core garment. Separate secondary accessories, which can appear in a shopping tray even if the visual try-on model can't reliably render them. Keep a replace button for every item.

## 6. Virtual try-on pipeline

**Open-source baseline:** FASHN VTON v1.5 (Apache-2.0, source https://github.com/fashn-AI/fashn-vton-1.5). It accepts a person photo, garment photo and garment `category` (`tops`, `bottoms`, `one-pieces`). It is NOT a multi-garment compositor and does NOT choose a new body pose. The local path needs a Python process, model weights and preferably a CUDA GPU.

Provide TWO adapters:
- `fashn_local`: FastAPI Python worker exposing normalized `/health` and `/render` routes, wrapping the documented `TryOnPipeline` from open-source VTON 1.5. Document weights download, hardware and startup steps. Do not download multi-GB weights on first Next.js startup.
- `fashn_api`: usable hosted fallback with documented FASHN API `tryon-v1.6` or `tryon-max`, submit job, poll status server-side, retrieve output, store copy privately. The hosted API and the open-source VTON release are separate products; do not treat their arguments as interchangeable. Pick appropriate `model_name` and params per their official docs.

**Outfit composition logic:**
1. Start from a clean, consented full-body photo (studio model is default; user photo optional).
2. If dress/jumpsuit selected: one-piece try-on first. Else: bottoms, then top. If outerwear selected, optionally try-on later while checking it hasn't overwritten the entire outfit.
3. Shoes, jewelry, hair, bags and complex multilayer details are NOT natively supported by open-source VTON categories; retain them in shopping list. An optional generic image-edit pass may add accessories, explicitly labeled as approximate. Never silently claim those items are accurately simulated.
4. Show source image, chosen garment product images, selected parts, and final render. Provide a per-garment retry, a full 'Regenerate' action, and before/after comparison.
5. Cache renders by person image hash + selected product image IDs + renderer/version + render settings. Invalidate dependent renders when outfit or person changes. Maintain job statuses and error reporting.

Output is a **stylistic fit visualization**, not a reliable prediction of fabric fit, garment sizing, logos, pattern placement or movement.

## 7. Pose studio — FIRST-CLASS FEATURE

**UX contract:** Pose picker visible next to wardrobe stage, like a DTI pose menu. Five preset thumbnails and names:
- `runway`: front-facing neutral runway stance
- `hip`: one hand on hip, shifted weight
- `peace`: peace sign, slight head tilt
- `shoulder`: 3/4 or over-the-shoulder editorial stance
- `lean`: controlled dramatic lean / crossed legs

Each preset has a bundled licensed/created pose reference *image* and optionally an OpenPose skeleton. Use the same crop/background family across poses. Changing pose must visibly change limbs/body position in generated or pre-baked images; **never fake pose variation by rotating, scaling, or skewing the same flat photo in CSS**.

**Important separation:** VTON v1.5 preserves the pose of its `person_image`; its built-in DWPose is not an arbitrary pose-switching UI. Therefore implement:

A. **Stable bundled demo mode (mandatory):** Provide at least one fictional adult studio model with a minimum of 3 real pose-specific base photos, plus 3 genuine corresponding wardrobe result assets for one seeded outfit (curated/created with permission). The pose menu switches distinct existing results instantly, marked as "Sample preview". Make these bundled assets legally usable and NOT user faces. If real pose-generation API exists, render missing pose/outfit combos on demand.

B. **Live pose generation (with API/model):** First create the full selected outfit in neutral/current pose, then send final wardrobe image + identity reference + pose-reference image (or OpenPose map) to a pose-conditioned image editor. Output should preserve face, body proportions, garment appearance and scene as much as possible. Implement `PoseProvider` with a concrete real provider that supports references/editing; a hosted image editor is acceptable for speed, and an OpenPose/ControlNet + image-editing model workflow can be offered as a documented open-source/GPU option. Re-pose the clothed image rather than expecting VTON alone to change pose. If appropriate, improve result by re-applying one dominant garment with VTON using the newly posed person image.

C. **Uploaded user photo:** Allow personal try-on in the input pose whether or not pose service is configured. If pose service is configured, allow requested re-poses and call them 'AI pose preview'; likeness and fit fidelity are best-effort. If pose edit fails, show original-pose try-on plus a clear limitation, not a fake transformed result.

Changing poses does not rerun shopping; it reuses selected outfit. Cache by `personHash|outfitHash|poseId|poseProvider|modelVersion`. On pose change show loading indicator and don't lose previous usable render.

**Why not 3D?** Real-time interactive skeletal rotation plus cloth wrapping would be a materially different, much larger project. Preset pose images meet the DTI-inspired visual interaction requirement for this MVP; camera orbit and animation are out of scope.

## 8. State, API, data safety

Simple state:

```ts
type ProductListing = {
  id: string; garmentId: string; source: string; title: string;
  productUrl: string; imageUrl: string; price?: number; currency?: string;
  condition?: 'new' | 'used' | 'unknown'; thrift?: boolean;
  retrievedAt?: string; matchScore?: number; isDemo: boolean;
};
type PoseId = 'runway' | 'hip' | 'peace' | 'shoulder' | 'lean';
type JobState = 'idle' | 'queued' | 'running' | 'completed' | 'failed';
```

Routes: `POST /api/analyze`, `POST /api/search`, `POST /api/tryon`, `POST /api/pose`, `POST /api/export`. Validate every payload with Zod, bound image sizes, rate-limit expensive calls, handle timeouts/retries. Never trust arbitrary remote image URLs as fetch targets: implement URL allowlist/proxy validation, block localhost/private IPs, and enforce size/time limits to mitigate SSRF. Revalidate sanitized external URLs before showing them.

Privacy: explicit consent for own-photo upload, no biometric profiling, no uploading others' photos without permission, don't publish user images by default. Store ephemeral images privately, provide Delete my session, avoid logging images and secrets. If provider sends user photo to an external API, disclose that before upload. Use demo/sample adults, not minors. If persistent storage not configured, explain local-only retention/deletion behavior accurately.

## 9. Demo mode, fixtures and developer experience

App must boot without external credentials. Include locally licensed/synthetic fixture screenshots, garment annotations, at least 2–3 item product result fixtures *clearly stamped "Demo listing"*, and 3 pose-specific render fixture images for a fictional model in a matching outfit. Demo fixtures are for testing UI flow, NOT presented as currently purchasable stock. Sample shopping links can go to general marketplace search pages rather than masquerade as active product listings.

Use clear notices when the system is in demo mode. If an API key is configured, use live provider and display any provider errors rather than quietly falling back to demo without disclosure. Provide a small `Provider status` indicator (Vision / Products / Try-on / Poses) and accurate supported/disabled behavior for each.

Generate `README.md` with exact commands for local startup, sample flow, environment variables, provider docs links, optional FASHN worker setup, tests, known limits and deployment notes. Include a seeded demo path that judges can complete without accounts or credentials.

## 10. Build sequence (Codex: implement in this order)

**Milestone 1 — Working app shell:** Next.js scaffold, responsive workbench, upload and example screenshot, schemas, state, fixture flows, pose selector UI, accessibility. Ensure UI is visually polished and all buttons are wired.

**Milestone 2 — Garment pipeline:** VLM extraction, normalized garment cards and screenshot overlays, manual correction, crop generation, loading/error handling.

**Milestone 3 — Product retrieval:** Search query generator, SerpApi adapter, optional eBay adapter, dedupe/rank, verified external listing links, product selection, small Filters panel.

**Milestone 4 — Real wardrobe try-on:** FASHN adapter(s), garment composition order, async rendering/polling, privacy-safe image handling, compare slider, cache.

**Milestone 5 — Pose rendering:** bundled multiple distinct pose photos/results for default demo model, pose rail, live pose-editor adapter, caching and fallback for uploaded users.

**Milestone 6 — Final pass:** export card, excellent empty/loading/error UI, integration/unit/e2e tests, docs, screenshots and visual smoke tests. Fix all build/type/lint failures.

## 11. Testing checklist

- [ ] `npm run dev` starts; `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` pass.
- [ ] Playwright can upload/select demo screenshot and see parsed pieces.
- [ ] Garment editing changes the next search query; response maps to the correct item.
- [ ] Product swap changes selected outfit and invalidates previous try-on appropriately.
- [ ] Mock live adapters test parsing, timeouts, empty results and malformed provider responses.
- [ ] Price and secondhand filters respect missing-price and condition data.
- [ ] All external purchase links are valid HTTPS and resolve to genuinely obtained destinations when live.
- [ ] Neutral, hip, peace (at minimum) visibly produce different pose images in demo.
- [ ] Uploaded person photo can try on a garment without a pose provider; missing pose provider shows an explicit limit.
- [ ] Provider failure doesn't white-screen; retry works.
- [ ] Upload privacy disclosure and session deletion are present.
- [ ] All external requests and credentials stay server-side.
- [ ] Mobile 375px viewport works; keyboard controls are usable.

## 12. Source docs to consult during implementation

- Open-source VTON: https://github.com/fashn-AI/fashn-vton-1.5
- FASHN hosted try-on: https://docs.fashn.ai/api-reference/tryon-v1-6 and https://docs.fashn.ai/api-reference/tryon-max
- FASHN pose/model context: https://docs.fashn.ai/api-reference/model-create and https://docs.fashn.ai/api-reference/product-to-model
- Shopping: https://serpapi.com/google-shopping-api
- Resale: https://developer.ebay.com/api-docs/buy/static/api-browse.html
- Depop access limitations: https://partnerapi.depop.com/api-docs/
- OpenPose/ControlNet implementation example: https://github.com/generativelabs/openpose-controlnet-recipes

## 13. Final Codex command / instruction

Place this file at `SPEC.md` in a clean project folder, then give Codex this instruction:

> Read SPEC.md completely and implement DTI2IRL as a polished, functioning end-to-end MVP in this repository. Follow the build sequence, create all screens, typed provider abstractions, real API integrations, truthful demo fixtures/fallbacks, virtual wardrobe and pose picker. Implement, run, test, inspect the UI in a browser where possible, and fix failures. Do not stop after writing a plan or scaffolding. Do not fabricate live listing data or claim pose/try-on success when a provider was not called. Finish by giving exact startup commands, the API keys needed for live features, and a concise list of verified versus unverified functionality.

**Top priority:** A screenshot should become an editable outfit, the outfit should map to real product candidates, and the selected fit should appear on a model across DTI-style preset poses. Keep the app tasteful, fun and technically honest.
