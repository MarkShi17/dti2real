# Verification — 2026-10-11

The demo workflows and provider contracts pass the tested browser matrix. Vision and an open-source SAM worker are now configured and have processed the real user-supplied `fit10` screenshot. See [real-image findings](vision-research.md); broad recognition accuracy and live try-on quality remain unmeasured.

## Results actually observed

| Check | Result |
| --- | --- |
| Full end-to-end suite | **151 passed**, 11.1 minutes, zero failures, skips or retries |
| Browser matrix | **31/31 each**: desktop Chromium, mobile Chromium, Firefox, mobile WebKit |
| Real HTTP/API checks | **12/12**, including session isolation, malicious payloads, upload normalization, request limits, caching and image exports |
| Production provider integration checks | **15/15** with explicit external transport fixtures, including recognition, shopping, image ranking, layered try-on, dress composition, pose requests and failure recovery |
| Provider recheck after shopping fixes | **15/15**, 1.7 minutes; shopping-fix production image, no retries |
| Final jewelry-filter regression | **3/3** mask browser checks, 13.1 seconds; unit test rejects jewelry masks even with high estimated quality |
| Real fit10 evaluation on final image | **6 pieces, 3 private garment masks**, 34.2 seconds; live providers, access isolation verified, temporary session deleted |
| CPU SAM worker | Five mask-quality unit tests pass; real inference on fit10; unauthorized/malformed HTTP requests rejected |
| Follow-up after Docker font correction | **9/9**, 73.45 seconds: stronger PNG glyph verification plus export recovery and complete pose/download/reload journeys in all four browser projects |
| Unit/server tests | **65 passed** in nine files |
| ESLint / TypeScript | Both exit 0, zero lint warnings |
| Production Docker build | Compiles application and all eleven API routes successfully |
| Test orchestration configuration | `docker compose -f compose.e2e.yaml config --quiet` and `sh -n scripts/test-e2e.sh`, exit 0 |
| Running app | Updated non-root `dti2irl-app` on loopback **3212**, persistent session volume retained |
| Manual browser inspection | Chrome at 1440×1100 and 375×812: no horizontal overflow or broken images; saved outfit restored after container update; Peace sign displays its distinct image |

[Machine-readable result summary](e2e-results.json). The full local HTML report is `playwright-report/index.html`; JSON reports are `test-results/results.json`, `test-results/post-font-results.json`, `test-results/post-vision-results.json`, and `test-results/post-jewelry-results.json`. Open the HTML report with `npx playwright show-report`.

The earlier 148-case run and nine font-specific follow-ups are retained in the machine-readable history. The new 151-case run includes mask transport/display/persistence, redraw invalidation and worker failures, using the corrected font-equipped image. It preceded the final shopping-query fallback patch; separate provider checks cover that patch. The final jewelry exclusion was followed by all 65 unit checks, three targeted mask browser cases, and a fresh real-provider evaluation. The [verified final PNG export](export-card.png) was decoded from the successful follow-up report and visually inspected; its labels are readable. The original full-run report retains the earlier export attachment, so use the final PNG above when reviewing export appearance.

## Defects reproduced and fixed

1. **Failed deletion could strand rendering controls.** Deleting a session invalidated old operations but left their busy state active when deletion failed. Invalidated indicators are now cleared explicitly; the regression proves the user can render again.
2. **A render could immediately become stale.** Automatic accessory selections could arrive after generation captured the outfit. Desktop, per-piece retry and mobile sticky generation now wait for pending searches. The UI explains the wait, and the generation function guards every entry point.
3. **Background analysis could clear an upload's progress.** Finishing the search batch reused the global busy state after a new upload started. Analysis now clears only its own reading phase. A gated upload/search test reproduces the overlap.
4. **Minimal Docker images exported missing-font boxes.** The first PNG check accepted nonblank pixels even though labels were unreadable. Visual inspection caught this. The runtime now installs Fontconfig and DejaVu fonts; the strengthened test measures full-size wordmark ink bounds and demonstrably fails on the old container.

Test harness corrections included preserving browser multipart upload streams during delay injection, waiting for image routes before teardown, separate request-cookie contexts, and pacing the suite below unchanged production limits. No failing application assertion was skipped or retried into a pass.

## Reproduction and infrastructure scope

```bash
npm run test:e2e:docker
```

This defines an isolated test project with no host ports, disposable session storage, fixed fake credentials and an external-provider fixture process. The normal user app and its persistent volume are separate. See the [coverage matrix and detailed commands](testing.md).

In this sandbox, the production servers and browser runner were launched with equivalent `docker run` commands because Compose daemon operations are restricted. They used the official `mcr.microsoft.com/playwright:v1.59.1-noble` image and a shared container network namespace. The Compose file and wrapper script were validated, but the full Compose wrapper itself was not executed here. The GitHub Actions workflow is included; no GitHub-hosted workflow run is claimed.

The disposable test containers were removed after verification. The app on port 3212 remains running from the final segmentation/jewelry-filter image; the real CPU SAM worker is running on loopback port 3213. To switch this manually launched container to Compose management, run `docker stop dti2irl-app dti2irl-segmentation`, then `docker compose --profile segmentation up --build -d`; both use the same `dti2irl_sessions` volume.

## Remaining limits

- Real `fit10` vision calls, actual CPU SAM masks, and live Google Shopping retrieval have been exercised. The live browser journey returned 60 non-demo listings; six camisole candidates received visual ranking. Later ranking calls returned HTTP 402 and fell back to explicit keyword matches. Subsequent real recognition and an eight-image diagnostic succeeded; provider availability is not guaranteed. [Final cutouts](fit10-masks.png) and [evaluation JSON](vision-evaluation.json) record actual output. Jewelry uses manual regions because incorrect skin masks can score highly. Recognition/similarity accuracy across a representative dataset, current inventory/stock, hosted try-on fidelity, live pose/identity preservation, eBay account eligibility and CUDA/GPU execution remain unverified. Fixture-generated images still do not establish successful live try-on.
- Mobile tests emulate viewport/touch behavior in Chromium and WebKit; they do not run on physical iPhones. Passing tests are not an exhaustive security or accessibility audit, nor a production load test.
- Demo outputs support the bundled black knit with the silver or burgundy skirt. Other products and uploaded-person generation need live inference. Accepted SAM masks are real pixel segmentation; uncertain pieces retain editable approximate boxes. Shoes, layers and accessories remain shopping references.
- Images are normalized to at most 1600px; original full-resolution bytes are not retained. Private local storage and in-process jobs require one persistent application replica. The SAM worker was executed on CPU and tested for authorization/validation. Neither the SAM nor FASHN worker was executed on a GPU.
