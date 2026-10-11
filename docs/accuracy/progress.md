# Accuracy evaluation ledger

Branch: eval/dti-accuracy. Base: b6dbe8a. Worktree: /Users/markshi/.codex/worktrees/74c1/dti2real.

1. Complete: isolated worktree, checked screenshot hashes, separate dependencies/data/build/browser port. No tracked changes or services in the other checkout were touched.
2. Complete: ten screenshots, eleven outfit cases, 73 reference pieces. Original references retained; corrected v2 labels and AI judgments disclose post-hoc and same-model limitations.
3. Complete: Cheaper Inference and six-query search pilots. Serper and SerpApi Google Shopping 6/6 nonempty, Depop residential 5/6, Grailed 3/6, eBay Apify 6/6.
4. Complete: explicit Serper/Depop/Grailed/eBay scraper adapters plus dedicated SerpApi eBay route. AVIF supported in both client validators and server image normalization.
5. Complete: all recognition, 69 retrieval pools, original visual ranking, strict verification and independent grading. Frozen keyword/visual outputs retained. Final HTML/JSON report generated.
6. Complete: Alexandria Shopify/Nike executed; raw HTTP/Playwright compared with curl_cffi/BeautifulSoup; enhanced Firecrawl and dedicated eBay API tested; candidate photos compared with original fit10 screenshot.

## Findings

- AVIF fix raises input success from 10/11 to 11/11. Recognized 69/73 pieces; identity precision under revised labels is 100%, not end-to-end fashion accuracy.
- Strict mode retains 84/811 listings and returns candidates for 41/69 detected pieces.
- Faithful returned top-three listings: 12.6% keyword versus 33.8% strict. Faithful top1 per all 73 references: 8.2% versus 20.5%; top3: 26.0% versus 21.9%. Fewer bad results come with lower coverage.
- Strict matching requires the original screenshot, all four visual criteria, real wearable products, and successful photo checks. Stale/rejected products and client selections are cleared.
- Direct TLS-compatible HTTP succeeds for Depop/eBay, twelve cards each. Ordinary HTTP/browser returned 403. Firecrawl enhanced retrieves real search content for both; SerpApi eBay returns 60 records.
- Alexandria Shopify/Nike succeeded at five credits each. Their photos and raw marketplace photos are checked in the report's fit10 diagnostic.
- Public Facebook browser yielded two listing photos; the Apify probe hit account monthly usage limits. Grailed raw page was only a shell; its Apify route produced results.
- Mixed-avatar recognition combines pieces from both people; crop one avatar before analysis.
- Two original visual-ranking pieces had HTTP402 fallback. Parallel strict attempts also had intermittent402 despite successful neighboring calls. Serial evaluation and smaller completion allowance resolved it; failed-attempt evidence retained.
- fit10 became a user-directed diagnostic after the camisole feedback. No claim of an independent strict-mode holdout for that case.

## Verification and accounting

Lint, typecheck, 83 unit tests and production build pass. Isolated Chrome smoke on3312 verifies AVIF upload, preview and analyze without page errors. The report browser check verifies 11 outfit sections, 69 strict panels, decoded photos and scraper diagnostics without page errors. Credential scan passed across all tracked/proposed files. Added regressions for monochrome colors, shoe construction, miniature clothing, unavailable screenshots/photos, stale listings, exact IDs, eBay parsing, bounded credit use and serialized inference.

Fresh-context review findings about preflight wiring, the duplicate AVIF validator, Firecrawl credit accounting, screenshot prerequisites and stale results were fixed. Final read-only review confirmed the stale-image and miniature-clothing fixes; its stale-ledger finding is resolved by this completed ledger.

Approved cap $30 including $5 pilot. Final recorded/estimated charges $6.6226; conservative accounted total $13.0226 including unknown reservations. No automatic retries of uncertain paid requests. Credentials remain in ignored environment files; report contains public listing evidence only.
