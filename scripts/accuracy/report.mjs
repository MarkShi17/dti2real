import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scoreCase } from './core.mjs';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const refs=json('docs/accuracy/references.json'),reviews=json('docs/accuracy/judgments.json');
const hasStrict=refs.cases.every(c=>existsSync('.accuracy/strict/'+c.id+'.json'));
const modeNames=['baseline','keyword','visual',...(hasStrict?['strict']:[])];
const cases=refs.cases.map(c=>{
 const review=structuredClone(reviews[c.id]),pieces=c.variants.find(v=>v.id===review.variant).pieces;
 const before=json('.accuracy/baseline/'+c.id+'.json'),after=json('.accuracy/retest/'+c.id+'.json');
 const keyword=json('.accuracy/shopping-all/'+c.id+'.json'),visual=json('.accuracy/rerank-all/'+c.id+'.json');
 const strict=hasStrict?json('.accuracy/strict/'+c.id+'.json'):undefined;
 review.products=review.matches.flatMap(m=>json('.accuracy/grading/'+c.id+'/'+m.expectedId+'.json').grades);
 review.complete=true;
 const beforeIds=new Set((before.garments||[]).map(g=>g.id));
 const beforeReview={...review,matches:review.matches.filter(m=>beforeIds.has(m.predictionId))};
 return {...c,pieces,before,after,keyword,visual,strict,review,metrics:{
  baseline:scoreCase(pieces,before.garments||[],keyword.rankings,beforeReview),
  keyword:scoreCase(pieces,after.garments||[],keyword.rankings,review),
  visual:scoreCase(pieces,after.garments||[],visual.rankings,review),
  ...(strict?{strict:scoreCase(pieces,after.garments||[],strict.rankings,review)}:{})
 }};
});
function aggregate(rows,mode){
 const ms=rows.map(c=>c.metrics[mode]),sum=k=>ms.reduce((s,m)=>s+(m[k]||0),0);
 const displayed=rows.flatMap(c=>c.review.matches.filter(m=>mode!=='baseline'||c.before.garments?.some(g=>g.id===m.predictionId)).flatMap(m=>(c[mode==='baseline'?'keyword':mode].rankings[m.predictionId]||[]).slice(0,3).map(p=>c.review.products.find(g=>g.expectedId===m.expectedId&&g.productId===p.id))));
 const faithfulSlots=displayed.filter(g=>g.grade===3).length,unknownSlots=displayed.filter(g=>g.grade===null).length;
 const expected=sum('expected'),predicted=sum('predicted'),tp=sum('truePositives'),precision=predicted?tp/predicted:0,recall=expected?tp/expected:0;
 return {displayedTop3Slots:displayed.length,faithfulSlots,unknownSlots,displayedFaithfulRate:displayed.length?faithfulSlots/displayed.length:null,displayedFaithfulRateUpper:displayed.length?(faithfulSlots+unknownSlots)/displayed.length:null,cases:rows.length,expected,predicted,truePositives:tp,falsePositives:sum('falsePositives'),falseNegatives:sum('falseNegatives'),precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0,attributeAccuracy:sum('attributeCorrect')/sum('attributeTotal'),meanIoU:ms.reduce((s,m)=>s+(m.meanIoU||0)*m.matchedBoxes,0)/sum('matchedBoxes'),top1:sum('faithfulTop1')/expected,top3:sum('faithfulTop3')/expected,top1UpperBound:ms.reduce((s,m)=>s+m.top1UpperBound*m.expected,0)/expected,top3UpperBound:ms.reduce((s,m)=>s+m.top3UpperBound*m.expected,0)/expected,unreviewableProducts:sum('unreviewableProducts')};
}
for(const c of cases)for(const mode of modeNames)c.metrics[mode].displayedFaithfulRate=aggregate([c],mode).displayedFaithfulRate;
const modes=rows=>Object.fromEntries(modeNames.map(k=>[k,aggregate(rows,k)]));
const ledger=json('.accuracy/ledger.json');
const pilot=['serper','grailed','ebay','depop',...(existsSync('.accuracy/pilot/0-serpapi.json')?['serpapi']:[])].map(source=>{
 const rows=Array.from({length:6},(_,i)=>json('.accuracy/'+(source==='depop'&&existsSync('.accuracy/pilot-residential/'+i+'-depop.json')?'pilot-residential':'pilot')+'/'+i+'-'+source+'.json'));
 return {source,queries:6,nonempty:rows.filter(r=>Array.isArray(r.data)?r.data.length:(r.data?.shopping||r.data?.shopping_results)?.length).length,results:rows.reduce((s,r)=>s+Math.min(6,Array.isArray(r.data)?r.data.length:(r.data?.shopping||r.data?.shopping_results)?.length||0),0),medianMs:rows.map(r=>r.elapsedMs||0).sort((a,b)=>a-b).slice(2,4).reduce((a,b)=>a+b,0)/2,reportedApifyUsd:rows.reduce((s,r)=>s+(r.run?.usageTotalUsd||0),0)};
});
const warningRows=mode=>cases.flatMap(c=>Object.entries(c[mode].warnings||{}).filter(([,v])=>v.length).map(([predictionId,warnings])=>({caseId:c.id,predictionId,warnings})));
const gradeRows=cases.flatMap(c=>c.review.products);
const sourceCoverage={};
for(const c of cases)for(const [predictionId,pool] of Object.entries(c.keyword.rankings)){
 for(const source of new Set(pool.map(p=>p.retrievalProvider||'unknown'))){
  sourceCoverage[source]??={piecesWithCandidates:0,candidates:0,judged:0,faithful:0,unreviewable:0};
  const stats=sourceCoverage[source];stats.piecesWithCandidates++;
  for(const p of pool.filter(p=>(p.retrievalProvider||'unknown')===source)){
   stats.candidates++;
   const match=c.review.matches.find(m=>m.predictionId===predictionId);
   const grade=c.review.products.find(g=>g.expectedId===match?.expectedId&&g.productId===p.id);
   if(grade){if(grade.grade===null)stats.unreviewable++;else stats.judged++;if(grade.grade===3)stats.faithful++;}
  }
 }
}
const summary={createdAt:new Date().toISOString(),branch:'eval/dti-accuracy',baseCommit:'b6dbe8a',recognitionModel:'gpt-5.4',judgeModel:'gpt-5.4',labelVersion:refs.version,
 warning:'AI-reviewed estimates on a small convenience sample, not human-certified accuracy. Labels revised after inspecting predictions; recognition prompt unchanged. Same-model visual judge may share errors with recognition/reranking.',
 comparison:'Original upload path + keyword ranking versus AVIF-capable upload + keyword/visual ranking on identical final Serper/Depop/Grailed candidate pools. Successful recognition outputs reused; no prompt tuning. Original SerpApi search was not scored. Strict mode filters the same pools by photo category, color distribution, silhouette and defining details; fewer results are intentional. fit10 became a user-directed diagnostic for strict matching, not an independent holdout.',
 coverage:{inputBefore:cases.filter(c=>!c.before.error).length,inputAfter:cases.filter(c=>!c.after.error).length,detected:cases.reduce((n,c)=>n+c.after.garments.length,0),withCandidates:cases.reduce((n,c)=>n+Object.values(c.keyword.rankings).filter(p=>p.length).length,0),searchWarnings:warningRows('keyword'),rerankWarnings:warningRows('visual'),strictWarnings:hasStrict?warningRows('strict'):[],strictPiecesWithMatches:hasStrict?cases.reduce((n,c)=>n+Object.values(c.strict.rankings).filter(p=>p.length).length,0):null,strictAccepted:hasStrict?cases.reduce((n,c)=>n+Object.values(c.strict.rankings).reduce((s,p)=>s+p.length,0),0):null,totalCandidates:cases.reduce((n,c)=>n+Object.values(c.keyword.rankings).reduce((s,p)=>s+p.length,0),0)},
 grading:{products:gradeRows.length,byGrade:Object.fromEntries([0,1,2,3,null].map(g=>[g===null?'unreviewable':String(g),gradeRows.filter(p=>p.grade===g).length])),uncertain:gradeRows.filter(g=>g.uncertain).length},
 robustness:existsSync('.accuracy/mixed/fit6-mixed.json')?json('.accuracy/mixed/fit6-mixed.json'):null,
 firecrawlProbe:existsSync('.accuracy/firecrawl/credits.json')?{credits:json('.accuracy/firecrawl/credits.json'),pages:['depop','grailed','ebay','facebook'].map(s=>json('.accuracy/firecrawl/'+s+'.json'))}:null,
 facebookProbe:existsSync('.accuracy/facebook/probe.json')?json('.accuracy/facebook/probe.json'):null,
 probes:existsSync('.accuracy/probes/summary.json')?json('.accuracy/probes/summary.json'):null,
 sourceCoverage,overall:modes(cases),splits:Object.fromEntries([...new Set(cases.map(c=>c.split))].map(s=>[s,modes(cases.filter(c=>c.split===s))])),
 families:Object.fromEntries([...new Set(cases.map(c=>c.family))].map(f=>[f,aggregate(cases.filter(c=>c.family===f),'visual')])),pilot,
 cost:{cap:ledger.cap,accountedUsd:ledger.entries.reduce((s,e)=>s+(e.actual??e.reserved),0),settledUsd:ledger.entries.reduce((s,e)=>s+(e.actual||0),0),unresolvedReservations:ledger.entries.filter(e=>e.actual===undefined),note:'CI settled charges; Apify reported run usage; search and Firecrawl requests use conservative estimates, not account invoices. Rejected-auth search estimates retained.'}};
writeFileSync('docs/accuracy/results.json',JSON.stringify({summary,cases},null,2));
writeFileSync('docs/accuracy/judgments.json',JSON.stringify(Object.fromEntries(cases.map(c=>[c.id,c.review])),null,2));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=n=>Number.isFinite(n)?(100*n).toFixed(1)+'%':'—';
const image=p=>existsSync(p)?'data:image/webp;base64,'+readFileSync(p).toString('base64'):'';
const productImage=p=>image('.accuracy/product-images/'+createHash('sha256').update(p.imageUrl).digest('hex')+'.webp');
const table=rows=>'<table><tr><th>Run</th><th>Recall</th><th>Precision</th><th>F1</th><th>Attributes</th><th>Box IoU</th><th>Top 1</th><th>Top 3</th><th>Faithful returned</th></tr>'+Object.entries(rows).map(([k,m])=>'<tr><th>'+esc(k)+'</th>'+[m.recall,m.precision,m.f1,m.attributeAccuracy,m.meanIoU,m.top1,m.top3,m.displayedFaithfulRate].map(v=>'<td>'+pct(v)+'</td>').join('')+'</tr>').join('')+'</table>';
function cards(c,m,mode){
 return '<div class="cards">'+(c[mode].rankings[m.predictionId]||[]).slice(0,3).map((p,i)=>{
  const g=c.review.products.find(g=>g.expectedId===m.expectedId&&g.productId===p.id),src=productImage(p);
  return '<article><b>#'+(i+1)+' · '+(g.grade===null?'Unreviewable':g.grade+'/3')+(g.uncertain?' · uncertain':'')+'</b>'+(src?'<img loading="lazy" src="'+src+'" alt="'+esc(p.title.slice(0,160))+'">':'<p>Image unavailable</p>')+'<a target="_blank" rel="noopener noreferrer" href="'+esc(p.productUrl)+'">'+esc(p.title.slice(0,160))+'</a><small>'+esc(p.source)+' · '+esc(p.retrievalProvider||'unknown')+' · '+esc(p.availability||'unknown')+'</small><small>'+(/(^|\.)google\.com$/.test(new URL(p.productUrl).hostname)?'Google offer page':'Direct listing link')+'</small><p>'+esc(g.reason)+'</p></article>';
 }).join('')+'</div>';
}
const sections=cases.map(c=>'<section id="'+c.id+'"><h2>'+c.id+' · '+esc(c.family)+' · '+esc(c.split)+'</h2><div class="reference"><img src="'+image('.accuracy/images/'+c.id+'.webp')+'" alt="Reference '+c.id+'"><div><p>'+esc(c.review.notes)+'</p>'+table(c.metrics)+'<p>Expected '+c.pieces.length+' · detected '+c.after.garments.length+'. Missing: '+esc(c.pieces.filter(p=>!c.review.matches.some(m=>m.expectedId===p.id)).map(p=>p.name).join(', ')||'none')+'</p></div></div>'+c.review.matches.map(m=>'<details><summary>'+esc(c.pieces.find(p=>p.id===m.expectedId).name)+' → '+esc(c.after.garments.find(p=>p.id===m.predictionId).name)+'</summary><p>Attribute mismatches: '+esc(Object.entries(m.attributes).filter(([,ok])=>!ok).map(([k])=>k).join(', ')||'none')+'</p><h3>Keyword top 3</h3>'+cards(c,m,'keyword')+'<h3>Visual top 3 · same pool</h3>'+cards(c,m,'visual')+(hasStrict?'<h3>Strict photo matches</h3>'+cards(c,m,'strict'):'')+'</details>').join('')+'</section>').join('');
const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DTI accuracy evaluation</title><style>body{font:16px system-ui;max-width:1400px;margin:auto;padding:30px;background:#f6f5f2;color:#202023}a{color:#684198}nav{display:flex;gap:14px;flex-wrap:wrap}section{border-top:2px solid #ddd;padding:28px 0}.reference{display:flex;gap:24px}.reference>img{width:240px;height:360px;object-fit:contain;background:white}.reference>div{flex:1;min-width:0;overflow:auto}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{padding:10px;border:1px solid #ddd;text-align:left}details{background:white;border:1px solid #ddd;border-radius:8px;margin:12px 0;padding:16px}summary{cursor:pointer;font-weight:650}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}article{border:1px solid #ddd;padding:12px}article img{width:100%;height:230px;object-fit:contain}article a,small{display:block;margin:6px 0}small{color:#555}.notice{background:#fff0c6;padding:18px}@media(max-width:700px){.reference{display:block}.cards{grid-template-columns:1fr}body{padding:15px}}</style><h1>DTI outfit accuracy</h1><p>'+esc(summary.createdAt)+' · 10 screenshots · 11 outfit cases</p><p class="notice">'+esc(summary.warning)+'</p><p>'+esc(summary.comparison)+'</p>'+table(summary.overall)+'<p>Grade 3 requires faithful category, colors, silhouette and defining details. Grades 0–2 are not faithful. Unavailable images remain unreviewable. Prices, sold status and shipping do not affect visual grades. Faithful returned measures grade-3 listings among displayed top-three slots; strict filtering improves this rate but still makes many errors and reduces coverage. Metrics with unreviewable images are lower bounds; upper bounds are in results.json.</p><p>Recorded/estimated charges: $'+summary.cost.settledUsd.toFixed(4)+'. Accounted including unresolved reservations: $'+summary.cost.accountedUsd.toFixed(4)+' / $30. Search warnings: '+summary.coverage.searchWarnings.length+'. Visual-ranking fallbacks: '+summary.coverage.rerankWarnings.length+'.</p><nav>'+cases.map(c=>'<a href="#'+c.id+'">'+c.id+'</a>').join('')+'</nav>'+sections+'</html>';
const probeCards=summary.probes?summary.probes.matches.map(p=>{
 const r=json('.accuracy/probes/'+p.source+'.json');
 return '<section><h3>'+esc(p.source)+' · '+r.products.length+'/'+r.candidates.length+' accepted</h3><p>Target: '+esc(r.garment.name)+' in fit10. These are matcher decisions, not independent grades.</p><div class="cards">'+r.candidates.map(candidate=>{
  const d=r.decisions.find(d=>d.id===candidate.id),accepted=r.products.some(p=>p.id===candidate.id),src=productImage(candidate);
  return '<article><b>'+(accepted?'Accepted':'Rejected / unavailable')+'</b>'+(src?'<img loading="lazy" src="'+src+'" alt="'+esc(candidate.title.slice(0,160))+'">':'<p>Image unavailable</p>')+'<a href="'+esc(candidate.productUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(candidate.title.slice(0,160))+'</a><p>'+esc(d?.reason||'Photo unavailable; no match claim.')+'</p></article>';
 }).join('')+'</div></section>';
}).join(''):'';
const extra='<section><h2>Strict matching coverage</h2><p>'+summary.coverage.strictAccepted+' accepted listings out of '+summary.coverage.totalCandidates+' candidates; '+summary.coverage.strictPiecesWithMatches+'/69 recognized pieces have a verified candidate. Empty results are counted as misses, not removed from the denominator.</p><h2>Retrieval experiments</h2><pre style="white-space:pre-wrap">'+esc(JSON.stringify({pilot:summary.pilot,probes:summary.probes},null,2))+'</pre></section>';
writeFileSync('docs/accuracy/report.html',html.replace('</html>',extra+probeCards+'</html>').replace(/[ \t]+$/gm,'')+'\n');
console.log(JSON.stringify(summary.overall,null,2));
console.log('Report: docs/accuracy/report.html; accounted cost $'+summary.cost.accountedUsd.toFixed(4));
