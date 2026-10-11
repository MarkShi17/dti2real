# DTI accuracy evaluation

Approved scope: 10 screenshots, 11 outfit cases (fit6 left/right), live recognition and shopping; preserve baseline, fix demonstrated issues, retest. Faithful appearance first; shipping, price and sold status are notes. $30 total cap ($5 pilot, $25 remaining). Main and its e2e work remain untouched.

1. Isolate at b6dbe8a on eval/dti-accuracy; copy originals with checksums.
2. Annotate expected garments and alternative constructions; ask user only about ambiguous cases. Initially hold out fit2/fit9/fit10 from tuning. Later user feedback names fit10's camisole, making fit10 a diagnostic for strict matching.
3. Preflight Cheaper Inference gpt-5.4 and pilot Serper/Apify (Depop, Grailed, eBay), six queries from fit1/fit3/fit5, six listings per source. Facebook exploratory.
4. Integrate working adapters and freeze baseline with original vision/ranking. SerpApi Google Shopping is an optional six-query coverage pilot; its retrieval is not part of the full scored comparison.
5. Measure precision/recall/F1, visible attributes, box IoU, faithful top1/top3, source coverage/latency/cost; fix observed failures (including AVIF) and retest. Keyword/visual comparison uses identical cached candidates.

Deliver repeatable npm run eval:accuracy command, local visual report, predictions and judgments, before/after summary. Live evaluation opt-in; never run under ordinary unit/e2e tests. Verify lint/typecheck/unit/build and isolated browser flow. Never present mocks as live results.

6. User follow-up: use Firecrawl Alexandria and compare direct HTTP/browser scraping on Depop/Grailed/eBay/Facebook. Make visual checks strict: monochrome color coverage, silhouette and shoe construction; reject mismatches or unverifiable listings, show a short reason, and re-evaluate the same cached pools without changing the saved keyword/visual baselines.
