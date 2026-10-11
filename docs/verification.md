# Verification — 2026-10-11

## Executed successfully

| Check | Evidence |
| --- | --- |
| ESLint | `npm run lint`, zero errors/warnings |
| TypeScript | `npm run typecheck`, exit 0 |
| Server/unit tests | `npm test`: 7 files, **52 tests passed** |
| Production build | `docker build -t dti2irl:local .`: `npm run build` compiles all 10 API routes and the application successfully |
| Compose | `docker compose config --quiet`, exit 0 |
| Docker runtime | Non-root production container `dti2irl-app`, **healthy**, loopback port **3212** |
| Browser tests | **6 passed** in 51.8 seconds against the final production container, desktop 1440×1100 and phone 375×667 |
| Visual inspection | Chrome DevTools inspected desktop and phone. At 375px, document width equals viewport width; no broken visible images. All five pose buttons show separate full-body assets. |
| Python worker | `python3 -m py_compile workers/fashn-local/app.py`, exit 0. Syntax verification only, not GPU inference. |

Browser automation ran in the official `mcr.microsoft.com/playwright:v1.59.1-noble` container because host server ports are sandbox-restricted and the installed host browser version did not match Playwright. It shared the app container's network namespace and used `http://127.0.0.1:3000` internally; the public host port is 3212. Browser screenshots: [desktop](desktop-studio.png), [phone](mobile-studio.png). Fixed-position controls in a full-page screenshot appear at the capture viewport boundary; the actual phone viewport was also inspected separately.

## End-to-end paths exercised

1. Example → five garment regions → product selections → try-on → all five distinct poses → burgundy skirt replacement → new image → linked SVG download → reload with retained selection/render.
2. Rename garment → search → capped-price empty state → reset → consent-gated person upload → truthful missing-provider error → keyboard-contained deletion dialog → delete session.
3. Upload screenshot → manual mode without vision keys → add/rename/change category → edit normalized region using keyboard coordinates → rotate image → clear old garment analysis.

Server tests additionally exercise actual PNG/SVG encoding, session isolation/deletion, malformed images, safe URL rules, missing/foreign-currency prices, secondhand conditions, malformed/empty provider output, job deduplication, cached intermediate layers, per-garment retry, failed-layer recovery, and preservation of an uploaded photo's original pose without a pose service. Live inference tests substitute explicit mock outputs; no mocked output is used by the running application.

Independent review identified and prompted fixes for queued searches overwriting edits, overlapping autosaves, person uploads stranding searches, poses using an old regenerated image, and incorrect “runway” labels on uploaded-photo outputs. Docker/browser testing also found and fixed proxy-origin handling, complete-product gating, modal Tab wrapping and the garment-category accessible name.

## Not verified with real credentials or hardware

Real screenshot recognition quality, current purchasable inventory, image-ranking quality, hosted try-on quality, live pose fidelity, eBay production eligibility, and GPU/CUDA execution. Their integrations are implemented against provider documentation and mocked at their boundaries. No live result, charge, stock state, recognition accuracy, GPU compatibility benchmark, or model success is claimed.

The demo deliberately uses synthetic sample images and illustrative shopping fixtures. Real garment crops are approximate boxes; no pixel segmentation claim is made. Stored images are normalized to a maximum of 1600px and stripped of metadata; original full-resolution upload bytes are not retained. Accessories/outerwear remain shopping references. Local storage and in-process jobs require a persistent single-replica deployment.

The started application is a manually launched Docker container named `dti2irl-app`. To switch to Compose management, stop it with `docker stop dti2irl-app`, then run `docker compose up --build -d`. The session volume name is compatible with Compose (`dti2irl_sessions`).
