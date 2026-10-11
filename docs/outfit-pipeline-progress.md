# Complete outfit pipeline implementation

Source: user-supplied “Upgrade Step 3 to generate complete, correctly layered outfits” plan.

1. Complete: coverage, schemas, layering validation, reference packing through sixteen garments.
2. Complete: direct Sunburst edits, GPT-5.4 review, two repairs, rejected-review diagnostics.
3. Complete: twenty-minute jobs, caching, frozen references, persisted accepted reviews, all five pose edits.
4. Complete: required selections, missing-piece guidance, screenshot/face/garment stale-result protection.
5. Complete with a comparison limitation: live inspection and rejection recorded; the legacy GPU baseline is unavailable. All 137 unit tests, lint, typecheck and production build pass. All twelve targeted desktop/mobile browser tests pass, covering new outfit behavior and existing demo/manual/upload flows.

Ruling: implement in the existing feature workspace — it contains extensive uncommitted work required by this task; a fresh checkout would omit that work. Preserve unrelated edits.
Ruling: retain the legacy composition behavior for demo/FASHN adapters — only openai_outfit supports complete outfit generation. The new provider requires every visible piece.
Pre-flight: try-on and poses share persisted immutable product references, layering plans, quality reviews, settings and identity; legacy renders must remain readable without those fields.
API verification: official OpenAI image-edit documentation supports JSON images with image_url, at most 16 images, gpt-image-2.5-sunburst, quality=max, 1024x1536. Omit input_fidelity for Sunburst.

Code review: fixed manual-garment signature instability by normalizing and canonicalizing descriptors. Blocked legacy pose adapters from bypassing complete-outfit review. Incremental review found no remaining critical or important implementation issues; evaluation candidate filenames now include a run timestamp.

Live diagnosis: an initial cyclic layering plan was rejected before image generation. A later three-candidate run exhausted both repairs and was rejected for bag side, necklace fidelity and an invented skirt opening. Product inspection confirmed the selected skirt has no slit; prompts now forbid invented openings and clarify fabric depth and wearer sides. No candidate from those failed runs was published. The configured legacy GPU baseline could not connect. Comparative superiority remains unestablished.

Final live result: 247 seconds including layering, three successful image submissions and three reviews. Closed skirt and wearer-side placement improved; bag silhouette and pendant detailing still failed all reviews. Saved and manually inspected all three rejected candidates, with full usage records. The application correctly preserves its last accepted preview. No image submissions were automatically retried. See `outfit-evaluation/sample/results.json`.
