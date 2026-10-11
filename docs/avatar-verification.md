# 3D avatar verification

Scope: the 3D fitting room. Photo preview and its GPU providers are handled separately.

The renderer uses the bundled MakeHuman rig and local MediaPipe assets. Selected garment images are resolved from the current private session through `/api/products/[id]/image`; the browser cannot supply a remote image URL to that endpoint. Normalized product images are bounded to 1024 pixels and returned with private, no-store caching and a same-origin resource policy.

The outfit updates directly from selected pieces. A tank has its own sleeveless mesh; long-sleeved knits, pinafore bodices and skirts, tights, and legwarmers are separate pieces. Continuous orbit, front/back/reset, zoom, all five rigged poses, proportion controls, and PNG export run in the browser without a photo-generation request.

## Automated checks

2026-10-11: full shared-source TypeScript check, production Docker build, and scoped lint pass. All 136 unit tests pass, including 21 avatar tests and the product-image privacy and browser UUID checks. Native Chromium passes all five avatar interaction tests against the final assets. Independent review found no remaining important issues. The isolated four-browser run is in progress.

Geometry regressions verify that tank meshes contain no arm surfaces and knit/tights meshes contain no finger-weighted vertices. These tests failed before the sleeve and invented-glove fixes. The packaged avatar has 17 meshes and the original 163-bone rig; all 62 recorded asset checksums were verified.

Reproduce the focused browser checks against an isolated demo instance:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3002 npx playwright test tests/e2e/avatar.spec.ts
```

Use the desktop, mobile, Firefox, and mobile WebKit projects in `playwright.config.ts`. WebGL-disabled environments must display the explicit graphics guidance while keeping the wardrobe usable. The face/body worker test loads only bundled model and WASM files; private reference persistence is checked through the session API.

## Limits

One listing image does not recover garment depth, exact measurements, hidden fabric, or a physical cloth simulation. Backside texture and garment geometry are estimates. The avatar is a style preview; it is not measured sizing or a recovered body scan. Remote GPU capacity does not set browser orbit frame rate.

If two visible pieces need the same fitted mesh, the preview names the omitted layer in its status text. Distinct supported layers—such as a knit under a pinafore, and tights under legwarmers—remain separate. Unsupported accessory shapes are also identified rather than silently presented as applied.

## Visual and performance evidence

The final white tank has continuous neckline and hem boundaries, a relaxed chest surface, bare arms, and bare fingers in the peace pose. The selected plaid pinafore retains the original photographed pattern over black knit sleeves. Hosiery packaging is treated as a material reference, and garment/background extraction prevents it from being printed onto the legs. The belt, beret, legwarmers, and shoulder bag are included in the layered reference check.

Private local screenshots are saved under `.cache/tryon-3d/avatar-final/`: `avatar-final-comparison.png`, `avatar-white-tank.png`, `avatar-white-tank-peace.png`, and the layered front/back/peace views. Original listing images are not bundled as app assets.

The following measurements were collected sequentially in native headless Chromium 1234 using SwiftShader, DPR 1, and a 387 × 516 canvas, without another render or build competing for CPU:

| Scene | FPS | Median frame | 95th-percentile frame |
| --- | ---: | ---: | ---: |
| Original studio baseline | 29.49 | 25.1 ms | 58.2 ms |
| Final studio | 45.39 | 24.9 ms | 25.5 ms |
| Final selected layered outfit | 33.61 | 32.5 ms | 41.7 ms |

Render counters remain unchanged while idle. Pointer events are coalesced into animation frames, and static shadows are reused until the pose or geometry changes. Software-renderer results are not a hardware frame-rate guarantee.
