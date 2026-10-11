# Search precision experiment

Branch `eval/search-precision-v2`, based on merged main `3fade69`. This branch adds an opt-in evaluation harness and public comparison artifacts. It does not change application search behavior or the running previews.

The question is whether better retrieval finds more faithful products without weakening the strict color, silhouette and footwear checks. Eight targets were selected before new retrieval: fit10 camisole and jeans, fit5/fit8/fit9 shoes, fit2 dress, fit1 corset and fit7 dress. These are development examples, not an unseen test set.

## Findings — 2026-10-11

Open [the standalone photo report](report.html) or [machine-readable results](results.json). The report embeds the original screenshots and listing photos, so no API keys are needed to inspect it.

No single retrieval strategy fixed accuracy on this small development set. Focused wording found faithful jeans, image-grounded queries found faithful black Mary Janes, and dedicated eBay search found a faithful embellished corset according to the separate AI judge. Each recovered a different target. These are AI judgments, not a claim that those products are identical to the screenshot.

| Strategy | Faithful / displayed top-three | Ambiguous or unavailable | Targets with a faithful top-three | Targets with any accepted result |
| --- | --- | --- | --- | --- |
| Current queries · Google | 0/6 | 5/6 | 0/8 | 3/8 |
| Feature-focused · Google | 1/11 | 7/11 | 1/8 | 5/8 |
| Quotes + exclusions · Google | 0/6 | 4/6 | 0/8 | 4/8 |
| Feature-focused · eBay | 1/4 | 2/4 | 1/8 | 3/8 |
| Image-grounded · Google | 1/10 | 5/10 | 1/8 | 5/8 |
| All five pools combined | 3/16 | 7/16 | 3/8 | 6/8 |

The current arm's zero faithful matches does **not** mean all its products are wrong: five of its six displayed products had insufficient visual evidence for a confident judgment; the remaining pair of jeans was close but lacked rolled cuffs. The same ambiguity rule applies to every arm. The combined simulation reaches 3/8 targets, but only 3/16 displayed products meet the full faithful criterion, and it uses up to five times the retrieval/verification budget. It is not ready to become the default.

- Quotes and exclusions reduced the total retrieved candidates from 84 to 48 without adding a faithful match. One constrained pink-dress query returned HTTP 500; the other succeeded. Some two-tone-shoe photos could not be checked.
- The white camisole remains unresolved in every arm. The reviewed target is a fitted halter V-neck, while the frozen recognition describes spaghetti straps and an asymmetrical hem. Image-grounded queries still used camisole terminology, and the downstream matcher retained the original attributes. Better retrieval cannot reliably repair a wrong or overstated target description by itself.
- Tiny or obscured shoe details produce many uncertain grades. Do not treat a high visual score as calibrated probability. Clear category, monochrome palette and visible shoe construction should stay mandatory; uncertain hidden details need separate treatment.
- Firecrawl returned API success and page HTTP 200 for all four eBay probes, with usable item-specific attributes. One shoe page offered multiple colors, so finding “white” on the page did not prove the displayed variant was white. The pages also contained unrelated recommended products: extract the main item's specifics and selected variant before comparing, rather than searching the whole page for a color word. This was a scrape feasibility check, not a measured accuracy improvement.

The next experiment should correct the target subtype from the original image, distinguish clear required features from uncertain ones, and test a bounded Google/eBay combination. Keep photo-based color rejection. No extra API credentials are needed for that work.

New recorded/estimated charges: **$1.3221**; accounted including unresolved reservations: **$1.5221**, within the additional $6 cap. 159 new paid-request reservations; cached requests are not additional charges. These figures are transport estimates, not provider invoices.

Validation: 97 unit tests, TypeScript and ESLint passed. Chrome loaded all 8 target sections and 158 embedded photos without broken images or page errors. A credential scan found no configured secrets in the 14 output/source files. The evaluation uses existing production parsers, ranking and photo matching without changing application code.

## Comparison

Each arm requests two queries, keeps at most six listings per query, deduplicates URLs and applies the existing keyword ranker and strict photo checker to at most twelve candidates:

1. Current recognition-generated queries through Serper Google Shopping.
2. Feature-focused seller terminology through the same service.
3. Focused queries with selective quoted phrases and negative terms.
4. Focused queries through dedicated SerpApi eBay search. This changes both source and query.
5. Image-grounded queries generated from the original screenshot and approximate crop, with the same downstream garment attributes and photo checker. This exploratory arm was added after inspecting retrieval behavior, before independent grading.

The matcher processes each arm separately. Duplicate products can receive different decisions in different batches. The separate judge sees the unique union of retrieval top-three and accepted top-three photos, ordered by ID without rankings, strategy names or matcher verdicts. It uses the reviewed reference annotation and original screenshot. It assigns 0 (wrong), 1 (broad type), 2 (close but defining differences), or 3 (faithful). Ambiguous or unavailable photos receive no faithful credit.

The report also simulates combining the five accepted top-three pools, sorted by visual score. That uses up to five times the query/candidate budget and is not a fair same-cost replacement. Cross-batch visual scores need not be calibrated.

## Reproduce

The frozen garment inputs, screenshot hashes and selected IDs are in `scripts/search-precision/cases.json`. Original screenshots are tracked in `docs/dti_example`. No new recognition pass is needed.

Use the existing ignored `.env.accuracy` with `ACCURACY_VISION_API_KEY`, `ACCURACY_SERPER_API_KEY`, `ACCURACY_SERPAPI_KEY`, and `ACCURACY_FIRECRAWL_API_KEY`. The current session links this file to the original repository's ignored `.env`. No new service accounts are required. Dependencies match main; use `npm ci` in a fresh checkout.

```sh
npm run eval:search -- plan --live
npm run eval:search -- image-plan --live
npm run eval:search -- retrieve --live
npm run eval:search -- verify --live
npm run eval:search -- judge --live
npm run eval:search -- details --live
npm run eval:search -- report
```

The additional accounted budget is capped at $6. Prior spending stays in the ledger; unknown charges retain reservations. Calls and completed phases cache under ignored `.accuracy/`. Cheaper Inference calls are serialized. A provider failure is recorded, never silently replaced with unverified matches. Inspect recorded errors before rerunning; the transport refuses uncertain paid requests rather than automatically billing them twice. Ordinary `npm test` never dispatches the experiment.

Four bounded Firecrawl enhanced-mode probes inspect the top two eBay camisole and white-shoe listings. Page HTTP status is checked separately from API success. These probes test whether listing pages yield usable evidence; they do not establish visual accuracy by themselves. Full page text stays in ignored caches.

## Limits and source contracts

- These are only eight previously used targets. The camisole was already a user-directed diagnostic. Do not generalize a small development-set improvement to all outfits.
- Current query responses may reuse prior cached retrieval while new queries are fresh. Inventory changes can affect comparisons. Missing images and provider errors remain visible in results.
- Matching and independent grading use the same gpt-5.4 service and can share errors. Grades are AI estimates; inspect the report's paired original and listing photos.
- No fit/size guarantee, stock guarantee, or proof of ongoing scraper reliability follows from this experiment.

Google documents [quoted phrases, exclusions and site operators](https://support.google.com/websearch/answer/2466433). These constrain indexed text, not garment color in the photo. [SerpApi's eBay contract](https://serpapi.com/ebay-search-api) supplies listing search and category/condition parameters. [Firecrawl's scrape documentation](https://docs.firecrawl.dev/features/scrape) distinguishes successful API calls from the target page's HTTP status. Contracts checked 2026-10-11.
