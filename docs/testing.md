# Comprehensive end-to-end testing

## Run everything

```bash
npm run test:e2e:docker
```

Requires Docker Desktop and npm to invoke the script; no local Node dependencies or browser installation is needed. Alternatively run `sh scripts/test-e2e.sh` without npm. Allow approximately 9–12 minutes after images are downloaded, plus 2–5 minutes for the first build/download. Playwright's three browser engines come from its version-matched official Docker image.

The separate `dti2irl-e2e` Compose project starts a production demo server, a production server with test-only provider transport fixtures, and a browser runner. It publishes **no host ports**, does not read `.env.local`, and uses disposable in-memory session directories. It does not touch the normal app or its persistent session volume. The script returns the test exit code and removes the test containers, including after a failure; its dependency cache volume remains. Run one full suite at a time because the provider fixture controller and report directory are shared.

```bash
npx playwright show-report
```

The HTML report includes screenshots of each browser's completed studio and a rendered PNG export. Failures retain a screenshot, DOM context and Playwright trace. `test-results/results.json` provides machine-readable results. There are **zero automatic retries**: a failing run stays failed. The latest [executed results](verification.md) distinguish the full run from the later provider changes and their targeted rechecks.

## Coverage matrix

| Layer | Cases | Outcomes checked |
| --- | ---: | --- |
| Browser workflows | 17 × 4 | Empty-state gating, provider/help UI, invalid/oversized/corrupt uploads and recovery, drag/drop, crop invalidation, hiding/restoring garments, required-product selection, combined filters, safe shopping links, honest unsupported-demo errors, compare/history, generation lineage, per-piece retry, HTML injection, reduced motion, narrow layout and persistence |
| Browser recovery and races | 11 × 4 | Session/search/analysis/pose/poll/export failures, late searches after deletion, stale searches after edits, uploads during search, overlapping autosaves, deletion failure during generation |
| Complete journeys | 3 × 4 | Example → individual product swap → five distinct poses → download → reload; manual edits/filters/photo consent/deletion; real file upload/manual garment/region correction/rotation |
| Real HTTP/security | 12 | Session authorization, private cookies/cache headers, foreign origins, unknown/prototype job IDs, invalid JSON/schema/size, image consent/type/dimensions, EXIF stripping, private/cross-session images and renders, forged selections, render caching, actual PNG/SVG bytes and rasterized text, request limits |
| Production provider integrations | 15 | Recognition → shopping → visual ranking, sequential bottoms/top composition, original personal-photo pose, private output, three-reference pose requests, corrected-dress one-piece inference, generation/pose failures and retries, corrupt/empty model output, malformed vision JSON, partial/total shopping outages, search/generation race, background-search/upload race, private mask persistence, manual redraw invalidation and segmentation outages |
| **Total** | **151** | **124 browser + 12 HTTP + 15 provider tests** |

Browser projects are desktop Chromium (1440×1100), mobile Chromium (iPhone SE dimensions/touch), desktop Firefox, and mobile WebKit (iPhone 13 dimensions/touch). Emulation is not a physical iPhone test. Every browser case asserts no unhandled application exceptions. Fault tests intercept specific client responses or delay them behind explicit gates; ordinary journey/API tests exercise real routes and filesystem storage.

Short browser tests are deliberately paced to at least four seconds because all projects share production global request limits. This is load pacing, not a fixed sleep used to guess when the UI is ready. UI assertions, job polling and autosave checks wait for observable outcomes. Keep one worker; fixture settings are intentionally serial.

## Provider fixtures and honest boundaries

`tests/support/provider-fixtures.mjs` is mounted only into the disposable provider container and loaded with an explicit Node `--import`. Application code never imports it. It rejects non-test API keys and blocks unexpected external provider destinations. It supplies deterministic protocol responses for vision, SAM masks, SerpApi, eBay, FASHN and fal, while real application parsing, HTTP routes, jobs, selected-image handling, output decoding and private storage run unchanged. Fixture listings say `TEST FIXTURE` and use reserved example-domain links. Output bytes are checked-in sample photographs; they are **not successful live model generations**.

The tests verify application behavior and adapter contracts. They do **not** establish current stock/prices, real recognition accuracy, visual similarity quality, provider account eligibility, photorealistic garment/identity fidelity, paid API availability, GPU compatibility, or production-scale reliability. Live evaluation still requires configured credentials, a representative screenshot/photo dataset, and human review; the optional CUDA worker has not been executed on a GPU. No fixture test claims those results. A separate real `fit10` evaluation and CPU SAM worker checks are documented in [vision research](vision-research.md); those are limited smoke evaluations, not an accuracy benchmark.

## Targeted local runs

Against a separate demo server (tests create/delete sessions and intentionally exercise limits):

```bash
npm ci
npx playwright install chromium firefox webkit
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3212 npm run test:e2e -- --project=desktop
```

Use `--project=mobile`, `--project=firefox`, `--project=webkit-mobile` or `--project=api` for another layer. Provider integration tests are included only when both `PLAYWRIGHT_LIVE_BASE_URL` and `PLAYWRIGHT_FIXTURE_CONTROL_URL` point at the isolated fixture server; do not point them at a real provider account. Without that configuration, the local suite has 136 cases and cannot claim provider integration coverage.

Fast checks:

```bash
npm run lint
npm run typecheck
npm test
```

`.github/workflows/verify.yml` runs these checks, builds the Docker app, runs the complete suite on pushes/pull requests, retains reports for seven days, and cleans up its test stack. Adding the workflow does not mean a GitHub-hosted run has already completed. Actions versions follow the official [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), and [upload-artifact](https://github.com/actions/upload-artifact) documentation.
