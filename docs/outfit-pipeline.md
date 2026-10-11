# Complete outfit rendering

Set `TRYON_PROVIDER=openai_outfit` and `POSE_PROVIDER=openai_outfit`. `OPENAI_API_KEY` authenticates only direct OpenAI image calls. Keep the existing GPT-5.4 configuration in `VISION_API_KEY`, `VISION_MODEL` and optional compatible provider/base URL. Explicit legacy provider settings and `DEMO_MODE=true` retain the existing adapters/sample behavior.

The client requires a real selection for every enabled garment; repeated categories and accessories count separately. Hidden pieces are excluded. `/api/tryon` accepts `screenshotId` and optional `faceId`, verifies reference ownership, validates mappings, then runs source layering analysis. Product photos define clothing appearance; the screenshot supplies arrangement only. Unmapped garments, unknown IDs, conflicting layers and invalid reviews stop publication.

One Sunburst edit creates the complete outfit at `quality=max`, `1024x1536`, `n=1`. Twelve product image slots leave four slots for person, optional face, previous candidate and pose guide. Above twelve products, four-item labeled boards retain every item; images and prompts identify each product/garment pair. The screenshot is never supplied as a clothing reference to the image editor.

GPT-5.4 checks every product, layering, identity, anatomy, accessory contact, merged fabrics, clipping and pose. A failed review allows two targeted repairs; each is reviewed again. Only a passing candidate becomes a render/cache entry. Failed or corrupt candidates leave the accepted preview and history intact. Pose edits reload the exact frozen product photos and layering plan from the accepted generation. A complete outfit cannot use an unreviewed legacy pose adapter.

Accepted renders persist product snapshots and image hashes, layering plans, all reviews from that generation, model/settings and per-call latency/usage. The cache includes source screenshot, person/face, garment descriptors, selected product snapshots, frozen image hashes, layering plan, model and settings. Frozen reference photos are reused for the same listing ID/image URL throughout the session, so a changed remote photo at the same URL does not silently alter an existing outfit. Selecting a listing with a new ID or URL creates new references. Screenshot, face and garment edits invalidate the preview; an accepted result from outdated selections goes to history without replacing the current image. Historical renders remain readable.

Jobs have a twenty-minute budget. Image submissions have a three-minute timeout; analysis/review calls have a two-minute timeout. Every image submission has retries disabled, including HTTP errors and ambiguous connection/timeouts. An invocation can still finish at the provider after a timeout and incur a charge. The app runs jobs in-process via Next.js `after()` and needs a persistent Node/Docker host that permits the full budget.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. The dedicated unit tests cover coverage/IDs, repeated categories, dress/layers/accessories, hidden pieces, all sixteen reference images, invalid mappings and cycles, review failures/two repairs, corrupt outputs, ambiguous submissions, caching, identity, frozen references, all five poses and last-preview preservation. `tests/e2e/outfit-complete.spec.ts` exercises selection guidance, hidden pieces, progress, identity payloads, poses, reload and changes during a job.

## Frozen live comparison

`outfit-evaluation/sample/manifest.json` freezes five real retailer listings selected in the repo's existing example. The source and person are the bundled example and fictional adult studio reference. Downloads are frozen under `products/`; both providers use identical bytes. No user-uploaded person photos or credentials are copied into the evaluation artifacts.

Explicit paid command (excluded from normal tests):

```bash
RUN_OUTFIT_EVAL=true RUN_OUTFIT_BASELINE=true npm test -- --config vitest.outfit-live.config.ts
```

The runner stores layering, reviews, timing/usage, errors and any accepted `sunburst.webp`/`legacy.webp` in the same directory. Diagnostic candidate images are saved separately, including rejected images; they are never published to the application. Exhausting both repairs retains all three reviews and six usage records. New diagnostic filenames contain a run timestamp so later evaluations do not overwrite them. It never retries an ambiguous image submission. Inspect actual products, visible layers, garment edges, closure/tucking, bag/jewelry contact, likeness and anatomy manually before making quality claims. Check `results.json` for the current result; previous attempts are retained separately. Automated acceptance does not establish Sunburst superiority, perfect generation or measured physical fit.

Primary references: [Sunburst model](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst), [OpenAI image-edit API](https://developers.openai.com/api/reference/resources/images/methods/edit).

### Observed result, October 11, 2026

All 137 unit tests and twelve targeted desktop/mobile browser tests passed, as did lint, typecheck and production build. Browser/provider fixtures verify application behavior; the following live evidence assesses actual generation.

The final frozen five-product run took about 247 seconds. Layering took 15.9 seconds; image calls took 66.8, 65.2 and 67.7 seconds; reviews took 10.8, 10.9 and 9.6 seconds. Total reported usage was 58,845 tokens across analysis, image generation and reviews; image usage is not a price estimate. All three submissions returned images; each failed quality review. Manual inspection confirmed that closed-skirt preservation and accessory side improved after prompt corrections, while the bag silhouette and necklace pendant still differed materially from the references. No failed candidate was published. Full per-call usage, reviews and diagnostic images are linked in `outfit-evaluation/sample/results.json`.

The configured FASHN local baseline failed to connect, so the paired renderer comparison remains unavailable. These examples do not establish Sunburst superiority. A syntactically valid layering graph can also contradict the planner's prose, as the necklace depth did here; automated structural validation does not establish semantic correctness.
