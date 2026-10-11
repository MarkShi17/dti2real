# DTI accuracy evaluation

Open [report.html](report.html) for original screenshots, ranked listing photos, independent grades, strict filtering, and scraper diagnostics. [results.json](results.json) contains the measurements; [judgments.json](judgments.json) contains the review decisions.

Work is isolated on `eval/dti-accuracy`, based on `b6dbe8a`. Dependencies, data, builds and browser port 3312 belong to this worktree. The other checkout and its e2e services are not used.

## What changed

Live shopping now checks listing photos against the original outfit screenshot before showing them. All four checks must pass: category, color distribution, silhouette and defining details. A solid white target rejects colored panels, contrasting trim and prints; shoe checks cover toe, heel, platform, shaft, closures and decorations. Missing photos, uncertain comparisons and unavailable vision fail closed. Accepted cards show a short concrete comparison. Refreshing a strict search clears earlier rejected listings and selections.

`STRICT_SHOPPING_MATCH=true` is the default. It needs a live vision provider and the original screenshot. Set it explicitly to false to use the previous keyword/optional visual-ranking behavior. The report preserves the original keyword and visual results. AVIF now works through both client validators and server normalization.

Production providers use normal, unprefixed keys. Examples:

```dotenv
SHOPPING_PROVIDERS=serper,depop,grailed
SERPER_API_KEY=...
APIFY_TOKEN=...
VISION_PROVIDER=openai_compatible
VISION_BASE_URL=https://api.cheaperinference.com/v1
VISION_MODEL=gpt-5.4
VISION_API_KEY=...
STRICT_SHOPPING_MATCH=true
```

`serpapi_ebay` searches eBay directly using `SERPAPI_KEY`. `serpapi` selects Google Shopping, and `ebay` selects the official eBay Browse adapter with its own credentials. `ebay_scraper` is the more expensive optional Apify actor. Evaluation keys never enable paid production services.

## Measured result

| Measure | Keyword search after AVIF fix | Strict photo filtering |
| --- | ---: | ---: |
| Identified reference pieces | 69/73 (94.5%) | Same recognition |
| Faithful among returned top-three slots | 26/207 (12.6%) | 25/74 (33.8%) |
| Reference pieces with a faithful top-one result | 6/73 (8.2%) | 15/73 (20.5%) |
| Reference pieces with a faithful result in top three | 19/73 (26.0%) | 16/73 (21.9%) |
| Detected pieces with any returned candidate | 69/69 | 41/69 |

The filter kept 84 of 811 candidates. Precision improved, but overall matching remains weak and coverage fell. Shoe construction is a recurring source of disagreement; approximate boxes average 0.412 IoU. These results support stricter rejection, not a claim that matches are reliably accurate.

The final toy-scale guard removes a real BJD doll-shoe false positive. For the user-directed camisole scraper diagnostic, none of the checked raw Depop/eBay/Facebook, Shopify or dedicated eBay candidates passed all checks. That demonstrates conservative filtering, not successful retrieval of the exact top. One Nike candidate passed, but a separate assistant visual spot-check considered its gray panel distribution debatable; it is not counted as independently validated accuracy.

## Reproduce

1. Copy `.env.accuracy.example` to ignored `.env.accuracy`; fill the ACCURACY-prefixed keys. In this session it links to the user-requested ignored repository `.env`.
2. Run `npm run eval:accuracy -- preflight --live`, then the phases `pilot`, `baseline`, `retest`, `shopping-all`, `rerank-all`, `strict`, and `judge`, each with `--live`. `npm run eval:accuracy` shows budget status.
3. For scraper diagnostics, run `alexandria` and `workarounds` through the same CLI. Run `node scripts/accuracy/raw-scrape.mjs --live` for HTTP/Playwright and the Python command below for browser-compatible HTTP/BeautifulSoup. Run `probes --live` after these to compare listing photos with fit10.
4. Run `npm run eval:accuracy -- report` to rebuild the offline HTML/JSON report. Ordinary tests never dispatch paid evaluations.

```sh
uv venv .accuracy/python
uv pip install --python .accuracy/python/bin/python -r scripts/accuracy/requirements-scrape.txt
.accuracy/python/bin/python scripts/accuracy/raw-http.py --live
```

The raw scripts use public pages, bounded queries and cached outputs; no account cookies or login. Python is needed only for this experimental scraper, not the Next.js application. A successful probe does not establish long-term scraping reliability.

The historical baseline captured the AVIF rejection before the fix. A fresh baseline on current code cannot recreate that historical failure. Successful recognition outputs are reused because the recognition prompt is unchanged. Optional probes: `mixed --live` for the original two-avatar screenshot and `facebook --live` for the bounded Apify actor. After a build, `node scripts/accuracy/smoke.mjs` checks AVIF upload, preview and analyze on isolated port 3312.

## Interpretation

Ten screenshots produce eleven outfit cases because fit6 contains two avatars. The mixed image is a separate robustness probe: recognition combined clothing from both avatars, so users should crop to one person. It is outside the eleven-case denominator.

- Piece recall/precision/F1 measure garment identity. They do not mean the returned products look right.
- Attribute accuracy covers reviewed colors, silhouette and visible details. Box IoU measures approximate rectangles.
- Faithful top1/top3 require independent grade 3: category, colors, silhouette and defining details match. Missed garments and empty results remain in the denominator.
- “Faithful returned” measures faithful listings among the displayed top-three slots. Unavailable images count against the lower bound; upper bounds are in JSON.
- All grades are AI estimates. The separate, rank-blind judge uses the same gpt-5.4 service and can share errors with the matcher. Its grades are separate from the acceptance decisions on scraper probe cards.

Reference v1 is retained. Version 2 corrected omitted visible accessories after inspecting baseline predictions, so this is an audited development evaluation, not an unbiased benchmark. fit2/fit9/fit10 were initially held out; the user's later camisole feedback makes fit10 a diagnostic for strict matching. Recognition itself was not tuned on those cases.

## Retrieval findings

SerpApi supplies structured search results; it is not the vision model. Serper offers a lower-cost Google search interface. Apify runs site-specific scrapers. Firecrawl Alexandria discovers and executes structured provider tools.

The six-query coverage pilot returned nonempty results for Serper 6/6, SerpApi Google Shopping 6/6, Grailed 3/6 and eBay's Apify scraper 6/6. Depop's datacenter requests returned 403 even with an Actor “SUCCEEDED” status. Residential proxies improved that to 5/6. Coverage is not relevance accuracy. Full scored candidate pools use Serper + Depop + Grailed; SerpApi was only piloted. The separate dedicated eBay probe returned 60 records; the comparison checks only the first twelve.

eBay's Apify pilot reported about $0.42–$0.445 per query. The dedicated SerpApi eBay adapter provides another route using the key already supplied. Google Shopping offer links are preserved and labeled; they are not fabricated merchant URLs.

Raw Chrome-compatible HTTP (`curl_cffi`) plus BeautifulSoup succeeded on Depop and eBay, extracting twelve public listing cards from each camisole search. Ordinary HTTP and isolated Playwright returned 403 on those sites. Firecrawl enhanced also returned real marketplace markdown: 24 distinct Depop product links and 73 eBay product links in the probe. Grailed returned a page shell without listings. Public Facebook browsing produced two listing photos; its Apify probe failed on the account's monthly hard limit, not a demonstrated Facebook block.

Alexandria Shopify catalog and Nike search both returned structured products, at five reported credits per call. Their candidate photos, raw scraper photos and dedicated eBay results are checked against the original fit10 screenshot in the diagnostic section. Alexandria's marketplace discovery returned no usable tools with a partial-discovery warning; that is not proof that no marketplace integration exists.

Primary references checked 2026-10-11:

- [Cheaper Inference API, reservations and billing](https://www.cheaperinference.com/docs)
- [Serper](https://serper.dev/), [SerpApi Google Shopping](https://serpapi.com/google-shopping-api), [dedicated eBay search](https://serpapi.com/ebay-search-api)
- [Depop actor](https://apify.com/lukass/depop-scraper/input-schema), [Grailed actor](https://apify.com/lulzasaur/grailed-scraper/input-schema), [eBay actor](https://apify.com/dtrungtin/ebay-items-scraper/input-schema), [Facebook actor](https://apify.com/leadproof/facebook-marketplace)
- [Firecrawl Alexandria](https://docs.firecrawl.dev/features/alexandria), [enhanced proxy](https://docs.firecrawl.dev/features/enhanced-mode)
- [curl_cffi browser-compatible TLS](https://curl-cffi.readthedocs.io/en/latest/)

## Budget and limitations

The approved cap is $30 including a $5 pilot. Requests reserve funds before dispatch. Responses cache with secrets redacted. CI settles reported charges; Apify reports run usage; search and Firecrawl charges are conservative estimates rather than invoices. Unknown charges retain reservations and cannot silently repeat.

Parallel CI calls intermittently returned HTTP 402 despite successful neighboring calls and remaining wallet credit reported by the user. Serializing inference and lowering matcher output allowance restored successful calls. This is consistent with reservation pressure, not a confirmed diagnosis of the provider. Failed attempts are preserved separately; the final strict run resumes only affected/missing pieces.

`.accuracy/` is ignored: private caches, downloaded photos, checkpoints and ledger. Tracked artifacts contain public listing evidence, references and judgments. No credentials or authorization headers are tracked.

Final accounting: $6.6226 recorded/estimated charges; $13.0226 including unresolved conservative reservations, under the $30 cap. These are not invoice totals. Verification: 83 unit tests, lint, typecheck, production build and isolated AVIF browser smoke passed.
