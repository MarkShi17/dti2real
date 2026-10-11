import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { measure } from './metrics.mjs';
import { assertRetrievalAvailable, assertVerificationAvailable } from './integrity.mjs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const root = '.accuracy/search-v2', out = 'docs/search-precision';
const targets = read('scripts/search-precision/cases.json');
const plans = read(root + '/plans.json').plans;
const arms = ['current', 'focused', 'constrained', 'ebay', 'image_grounded'];
const labels = { current: 'Current queries · Google', focused: 'Feature-focused · Google', constrained: 'Quotes + exclusions · Google', ebay: 'Feature-focused · eBay', image_grounded: 'Image-grounded · Google', combined: 'All five pools combined' };
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const canonical = raw => { const u = new URL(raw); u.hash = ''; for (const key of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid)/.test(key)) u.searchParams.delete(key); return u.href; };
const pct = value => value === null ? '—' : (value * 100).toFixed(1) + '%';
const rows = [];
for (const target of targets) {
  const key = target.caseId + '-' + target.garmentId;
  const garment = target.garment;
  const judgment = read(`${root}/judging/${key}.json`);
  const row = { ...target, garment, reference: judgment.reference, plan: plans.find(p => p.id === target.garmentId), grades: judgment.grades, arms: {} };
  for (const arm of arms) {
    const retrieval = read(`${root}/retrieval/${key}-${arm}.json`), verification = read(`${root}/verification/${key}-${arm}.json`);
    assertRetrievalAvailable(retrieval); assertVerificationAvailable(retrieval, verification);
    if (verification.warnings.length || retrieval.errors.length) console.warn(key, arm, 'has provider/image warnings');
    const clean = products => products.map(p => ({ ...p, productUrl: canonical(p.productUrl) }));
    row.arms[arm] = { retrieval: clean(retrieval.products), verified: clean(verification.products), queries: retrieval.queries, retrievalMs: retrieval.elapsedMs, verificationMs: verification.elapsedMs, errors: retrieval.errors, warnings: verification.warnings, decisions: verification.decisions };
  }
  const combined = [...new Map(arms.flatMap(arm => row.arms[arm].verified.slice(0, 3)).map(p => [p.productUrl, p])).values()].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  row.arms.combined = { retrieval: [], verified: combined, queries: [], errors: [], warnings: [], decisions: [], retrievalMs: 0, verificationMs: 0 };
  rows.push(row);
}
const metrics = {};
for (const arm of [...arms, 'combined']) {
  const records = rows.map(row => ({ ...row.arms[arm], grades: row.grades }));
  metrics[arm] = { retrieval: measure(records, 'retrieval'), verified: measure(records, 'verified') };
}
const ledger = read('.accuracy/ledger.json'), entries = ledger.entries.filter(e => e.phase?.startsWith('search-v2-'));
const budget = { calls: entries.length, knownOrEstimatedUsd: entries.reduce((sum, e) => sum + (e.actual ?? 0), 0), accountedUsd: entries.reduce((sum, e) => sum + (e.actual ?? e.reserved), 0), cumulativeCapUsd: ledger.cap, note: 'Provider estimates and unresolved reservations, not an invoice. Current queries may reuse cached responses from the prior evaluation.' };
const budgetSnapshot = read(root + '/budget.json');
Object.assign(budget, budgetSnapshot, { remainingIncrementalUsd: budgetSnapshot.incrementalCap - budget.accountedUsd });
if (budget.accountedUsd > budgetSnapshot.incrementalCap + 0.000001 || ledger.cap > budgetSnapshot.previousAccounted + budgetSnapshot.incrementalCap + 0.000001) throw new Error('Experiment budget exceeds its recorded incremental limit.');
const pageProbes = readdirSync(root + '/details').filter(f => f.endsWith('.json')).map(f => {
  const { markdown, ...record } = read(root + '/details/' + f);
  return { ...record, markdownCharacters: markdown?.length || 0 };
});
mkdirSync(out, { recursive: true });
writeFileSync(out + '/results.json', JSON.stringify({ generatedAt: new Date().toISOString(), baseCommit: '3fade69', branch: 'eval/search-precision-v2', labels, metrics, budget, pageProbes, rows }, null, 2));
const uri = path => existsSync(path) ? 'data:image/webp;base64,' + readFileSync(path).toString('base64') : '';
const card = (p, row) => {
  const grade = row.grades.find(g => g.productUrl === p.productUrl);
  const src = uri('.accuracy/product-images/' + createHash('sha256').update(p.imageUrl).digest('hex') + '.webp');
  return `<article>${src ? `<img src="${src}" alt="${esc(p.title)}">` : '<div class="missing">Photo unavailable</div>'}<b>${esc(p.title)}</b><span>${esc(p.source)} · grade ${grade?.grade ?? '?'}${grade?.uncertain ? ' · uncertain' : ''}</span><p>${esc(grade?.reason || 'Not independently graded')}</p><a href="${esc(p.productUrl)}" target="_blank" rel="noopener noreferrer">Listing ↗</a></article>`;
};
const table = (stage, list) => `<div class="table-wrap"><table><thead><tr><th>Strategy</th><th>Faithful / displayed top-three</th><th>Ambiguous / unavailable</th><th>Faithful top-one</th><th>Target has faithful top-three</th><th>Any results</th></tr></thead><tbody>${list.map(arm => { const m = metrics[arm][stage]; return `<tr><th>${labels[arm]}</th><td>${m.faithful}/${m.displayed} (${pct(m.faithfulPrecision)})</td><td>${m.unjudgeable}/${m.displayed}</td><td>${m.top1}/${m.targets}</td><td>${m.top3}/${m.targets}</td><td>${m.covered}/${m.targets}</td></tr>`; }).join('')}</tbody></table></div>`;
const referenceText = row => [row.reference.name, row.reference.attributes.silhouette, ...(row.reference.attributes.color || []), ...(row.reference.attributes.details || [])].filter(Boolean).join(' · ');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Search precision experiment</title><style>body{font:16px system-ui;max-width:1500px;margin:35px auto;padding:0 24px;color:#21252b;background:#f4f5f7}h1{font-size:32px}h2{margin-top:42px}p{max-width:1000px;line-height:1.5}.table-wrap{overflow-x:auto}table{border-collapse:collapse;background:white;width:100%;font-size:14px}td,th{border:1px solid #ddd;padding:12px;text-align:left}.target{display:flex;gap:24px;align-items:start}.original{width:180px;max-height:350px;object-fit:contain;position:sticky;top:12px}.arms{flex:1;min-width:0}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}article{background:white;border:1px solid #ddd;padding:12px;border-radius:6px;display:flex;flex-direction:column;gap:7px}article img,.missing{height:190px;width:100%;object-fit:contain}article span{font-size:13px;color:#536}.query{font:13px monospace;overflow-wrap:anywhere}.note{background:#fff3cd;padding:16px}section{border-top:2px solid #ccc;margin-top:45px}summary{cursor:pointer;padding:12px 0}a{color:#2648a0}@media(max-width:750px){.target{display:block}.original{position:static;width:160px}.cards{grid-template-columns:1fr}table{font-size:11px}td,th{padding:6px}}</style><h1>Search precision: five retrieval strategies</h1><p>Eight preselected pieces from seven outfit cases. Every strategy gets two queries, at most six listings per query, and the same strict photo checker. Verification is run separately per arm; the judge sees unique listings ordered by ID without query strategy or acceptance decisions. The eBay arm changes both source and query. Grade 3 means faithful color, silhouette and visible details; ambiguous photos do not receive credit.</p><p class="note">Development experiment, not a held-out benchmark. Same gpt-5.4 service supplies the separate rank-blind judge and matcher; errors can be correlated. Current query responses can be cached while new queries are fresh, so inventory drift is a confound. The combined pool uses up to five times the retrieval/photo-check budget. No production behavior changed.</p><h2>After strict photo checks</h2>${table('verified', [...arms, 'combined'])}<h2>Before photo checks</h2>${table('retrieval', arms)}<p>Recorded/estimated new charges: $${budget.knownOrEstimatedUsd.toFixed(4)}; including unresolved reservations: $${budget.accountedUsd.toFixed(4)}. ${budget.calls} paid-request reservations. These are not invoice totals.</p><h2>Compare photos yourself</h2>${rows.map(row => `<section><h2>${esc(row.caseId)} · ${esc(row.garment.name)}</h2><p>Reviewed target: ${esc(referenceText(row))}</p><div class="target"><img class="original" src="${uri('.accuracy/images/' + row.caseId + '.webp')}" alt="Original ${esc(row.caseId)} screenshot"><div class="arms">${arms.map(arm => `<h3>${labels[arm]}</h3>${[...row.arms[arm].errors, ...row.arms[arm].warnings].length ? `<p class="note">Partial evidence: ${[...row.arms[arm].errors, ...row.arms[arm].warnings].map(esc).join(" ")}</p>` : ""}<p class="query">${row.arms[arm].queries.map(esc).join('<br>')}</p><div class="cards">${row.arms[arm].verified.slice(0, 3).map(p => card(p, row)).join('') || '<p>No verified result.</p>'}</div><details><summary>Before photo filtering (${row.arms[arm].retrieval.length} candidates)</summary><div class="cards">${row.arms[arm].retrieval.slice(0, 3).map(p => card(p, row)).join('')}</div></details>`).join('')}</div></div></section>`).join('')}<h2>Listing-page probes</h2><p>Firecrawl fetched ${pageProbes.length} selected eBay pages. Their page-status and content-length evidence is in results.json; a successful scrape alone does not establish a product match.</p><p>Sources: <a href="https://support.google.com/websearch/answer/2466433">Google search operators</a>; <a href="https://serpapi.com/ebay-search-api">SerpApi eBay contract</a>; <a href="https://docs.firecrawl.dev/features/scrape">Firecrawl scrape and page status</a>.</p></html>`;
writeFileSync(out + '/report.html', html);
console.log(JSON.stringify({ metrics, budget, pageProbes: pageProbes.map(p => ({ title: p.title, pageStatus: p.pageStatus, markdownCharacters: p.markdownCharacters })) }, null, 2));
