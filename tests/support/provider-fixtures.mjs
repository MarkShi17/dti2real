// Explicit test-only transport fixtures. Never imported by application code.
// Launch with: node --import /fixtures/provider-fixtures.mjs server.js
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports, createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

if (process.env.DTI2IRL_TEST_PROVIDER_FIXTURES !== '1') throw new Error('Provider fixtures require explicit test-only launch');
for (const name of ['VISION_API_KEY', 'SERPAPI_KEY', 'FASHN_API_KEY', 'POSE_API_KEY', 'EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'SEGMENTATION_TOKEN', 'FASHN_LOCAL_TOKEN', 'POSE_LOCAL_TOKEN']) {
  if (process.env[name] && !process.env[name].startsWith('test-only-')) throw new Error('Real credentials are forbidden in the fixture process');
}
const host = 'dti2irl-fixtures.example.com';
const sharp = createRequire('/app/package.json')('sharp');
const calls = [], jobs = new Map();
let settings = {}, sequence = 0;
const photo = async (name = 'silver-runway.webp') => readFile(`/app/public/demo/${name}`);
const dataImage = async name => `data:image/webp;base64,${(await photo(name)).toString('base64')}`;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const hash = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
const garments = [
  { name: 'Test knit', category: 'top', attributes: { color: ['black'], material: 'knit', silhouette: 'fitted', pattern: 'solid', aesthetic: ['minimal'], details: ['high neck'] }, bbox: { x: .25, y: .2, w: .5, h: .3 }, confidence: .9, searchQueries: ['black fitted knit sweater', 'black high neck top'] },
  { name: 'Test skirt', category: 'bottom', attributes: { color: ['silver'], material: 'satin', silhouette: 'pleated maxi', pattern: 'solid', aesthetic: ['editorial'], details: [] }, bbox: { x: .25, y: .45, w: .5, h: .4 }, confidence: .8, searchQueries: ['silver pleated maxi skirt', 'silver satin skirt'] },
  { name: 'Test boots', category: 'shoes', attributes: { color: ['black'], material: 'leather', silhouette: 'ankle', pattern: 'solid', aesthetic: [], details: [] }, bbox: { x: .3, y: .8, w: .4, h: .15 }, confidence: .75, searchQueries: ['black leather ankle boots'] },
];

await new Promise(resolve => http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://fixture');
    if (['/health', '/render', '/pose'].includes(url.pathname)) {
      if (req.headers.authorization !== `Bearer ${process.env.FASHN_LOCAL_TOKEN}` || !process.env.FASHN_LOCAL_TOKEN) { res.writeHead(401).end('{}'); return; }
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/health') {
        calls.push({ provider: 'gpu-health' });
        if (settings.gpu === 'offline') { res.writeHead(503).end('{}'); return; }
        res.end(JSON.stringify({ cuda_available: settings.gpu !== 'no-cuda', tryon: { ready: settings.gpu !== 'weights', reason: settings.gpu === 'weights' ? 'weights_missing' : 'ready' }, pose: { ready: settings.gpu !== 'weights', reason: settings.gpu === 'weights' ? 'weights_missing' : 'ready' } })); return;
      }
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const payload=JSON.parse(Buffer.concat(chunks).toString());
      calls.push({ provider: url.pathname === '/render' ? 'gpu-tryon' : 'gpu-pose', category: payload.category, personHash: hash(payload.person_image), imageCount: ['wardrobe_image','identity_image','pose_image'].filter(key=>payload[key]?.startsWith('data:image/')).length, identityHash: hash(payload.identity_image), pose: payload.pose });
      if (settings.gpu === 'busy') { res.writeHead(429).end('{}'); return; }
      if (settings.gpu === 'failed' || (url.pathname === '/pose' && settings.pose === 'failed')) { res.writeHead(500).end('{}'); return; }
      if (url.pathname === '/pose' && settings.pose === 'delayed') await new Promise(resolve=>setTimeout(resolve,700));
      res.end(JSON.stringify({ image: settings.gpu === 'corrupt' ? 'data:image/png;base64,YmFk' : await dataImage(url.pathname === '/pose' ? `silver-${payload.pose}.webp` : 'silver-runway.webp') }));return;
    }
    if (req.method === 'POST' && ['/reset', '/config'].includes(url.pathname)) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (url.pathname === '/reset') { settings = {}; calls.length = 0; jobs.clear(); }
      Object.assign(settings, input); res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    } else if (url.pathname === '/calls') res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(calls));
    else if (url.pathname === '/image') res.writeHead(200, { 'content-type': 'image/webp' }).end(await photo('silver-runway.webp'));
    else res.writeHead(404).end();
  } catch { res.writeHead(500).end('Fixture control failure'); }
}).listen(4010, '0.0.0.0', resolve));

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost', '0.0.0.0'].includes(url.hostname)) return originalFetch(input, init);
  const body = init.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : {};
  if (url.hostname === 'sam-fixture.example.com') {
    calls.push({ provider: 'segmentation' });
    if (settings.segmentation === 'failure') return json({}, 503);
    if (settings.segmentation !== 'success') return json({ model: 'test-fixture-mask', segments: [] });
    const source = Buffer.from(body.image.split(',')[1], 'base64');
    const { width, height } = await sharp(source).metadata();
    const segments = await Promise.all(body.garments.map(async g => {
      const pixels = Buffer.alloc(width * height), b = g.bbox;
      for(let y=Math.ceil(b.y*height);y<Math.floor((b.y+b.h)*height);y++) for(let x=Math.ceil(b.x*width);x<Math.floor((b.x+b.w)*width);x++) {
        // Explicit nonrectangular synthetic mask; this tests transport/display, not SAM accuracy.
        if(x/width>b.x+b.w*.2 || y/height>b.y+b.h*.2) pixels[y*width+x]=255;
      }
      const png=await sharp(pixels,{raw:{width,height,channels:1}}).png().toBuffer();
      return {id:g.id,score:.9,mask:`data:image/png;base64,${png.toString('base64')}`};
    }));
    return json({model:'test-fixture-mask',segments});
  }
  if (url.hostname === 'api.openai.com') {
    calls.push({ provider: 'vision', schema: body.response_format?.json_schema?.name });
    if (settings.vision === 'unauthorized') return json({ error: 'fixture unauthorized' }, 401);
    if (settings.vision === 'malformed') return json({ choices: [{ message: { content: 'not json' } }] });
    if (body.response_format?.json_schema?.name === 'matches') {
      const candidates = body.messages[0].content.filter(c => c.type === 'text' && c.text.startsWith('Candidate ID '));
      return json({ choices: [{ message: { content: JSON.stringify({ matches: candidates.map((c, i) => ({ id: c.text.match(/^Candidate ID ([^:]+):/)[1], score: 95 - i * 10, reason: 'TEST FIXTURE visual score' })) }) } }] });
    }
    return json({ choices: [{ message: { content: JSON.stringify({ garments }) } }] });
  }
  if (url.hostname === 'serpapi.com') {
    const q = url.searchParams.get('q') || ''; calls.push({ provider: 'shopping', query: q, market: url.searchParams.get('gl') });
    if (settings.shopping === 'failure') return json({ error: 'fixture unavailable' }, 503);
    if (settings.shopping === 'malformed') return json({ wrong: [] });
    if (settings.shopping === 'empty') return json({ shopping_results: [] });
    const category = /skirt/.test(q) ? 'bottom' : /boots/.test(q) ? 'shoes' : 'top';
    return json({ shopping_results: [0, 1, 2].map(i => ({ title: `TEST FIXTURE ${category} ${i} ${q}`, source: 'Test Fixture Boutique', product_link: `https://example.com/fixture/${category}/${i}`, thumbnail: `https://${host}/${category}/${i}.webp`, ...(i < 2 ? { price: `$${80 - i * 30}`, extracted_price: 80 - i * 30 } : {}), ...(i === 1 ? { second_hand_condition: 'used' } : {}) })).concat([{ title: 'UNSAFE MUST BE DROPPED', source: 'Test', link: 'https://127.0.0.1/private', thumbnail: `https://${host}/unsafe.webp` }]) });
  }
  if (url.hostname === 'api.ebay.com') {
    if (url.pathname.includes('/oauth2/token')) { calls.push({ provider: 'ebay-token' }); return json({ access_token: 'test-only-oauth', expires_in: 3600 }); }
    calls.push({ provider: 'ebay', market: new Headers(init.headers).get('X-EBAY-C-MARKETPLACE-ID'), filter: url.searchParams.get('filter') });
    if (settings.ebay === 'failure') return json({}, 503);
    if (settings.ebay === 'empty') return json({ total: 0 });
    return json({ itemSummaries: [{ itemId: 'fixture-ebay', title: `TEST FIXTURE pre-owned ${url.searchParams.get('q')}`, itemWebUrl: `https://example.com/fixture/ebay?q=${encodeURIComponent(url.searchParams.get('q'))}`, image: { imageUrl: `https://${host}/ebay.webp` }, price: { value: '30', currency: 'USD' }, condition: 'Pre-owned', conditionId: '3000' }] });
  }
  if (url.hostname === 'api.fashn.ai') {
    if (url.pathname.endsWith('/run')) {
      calls.push({ provider: 'tryon-submit', model: body.model_name, category: body.inputs?.category, personHash: hash(body.inputs?.model_image), garmentHash: hash(body.inputs?.garment_image) });
      if (settings.tryon === 'submission-failure') return json({}, 503);
      const id = `fixture-${++sequence}`; jobs.set(id, { kind: 'tryon', mode: settings.tryon }); return json({ id, error: null });
    }
    calls.push({ provider: 'tryon-poll' }); const job = jobs.get(url.pathname.split('/').at(-1));
    if (job?.mode === 'failed') return json({ status: 'failed', error: 'TEST FIXTURE failure' });
    return json({ status: 'completed', output: job?.mode === 'empty' ? [] : [job?.mode === 'corrupt' ? 'data:image/png;base64,YmFk' : await dataImage('silver-runway.webp')] });
  }
  if (url.hostname === 'queue.fal.run') {
    if (init.method === 'POST') {
      calls.push({ provider: 'pose-submit', imageCount: body.image_urls?.length, outfitHash: hash(body.image_urls?.[0]), prompt: body.prompt });
      const id = `pose-${++sequence}`; jobs.set(id, { mode: settings.pose });
      return json({ request_id: id, status_url: settings.pose === 'unsafe' ? 'https://127.0.0.1/private' : `https://queue.fal.run/status/${id}`, response_url: `https://queue.fal.run/result/${id}` });
    }
    const job = jobs.get(url.pathname.split('/').at(-1));
    if (url.pathname.startsWith('/status')) return json({ status: job?.mode === 'failed' ? 'FAILED' : 'COMPLETED' });
    return json({ images: [{ url: await dataImage('silver-peace.webp') }], has_nsfw_concepts: [false] });
  }
  throw new Error(`External request blocked by test transport: ${url.hostname}`);
};

const lookup = dns.lookup;
dns.lookup = async (name, options) => name === host ? [{ address: '8.8.8.8', family: 4 }] : lookup(name, options);
https.get = (url, _options, callback) => {
  if (new URL(url).hostname !== host) throw new Error('Unexpected external image request blocked in test process');
  const request = new EventEmitter(); request.destroy = error => { if (error) request.emit('error', error); request.emit('close'); };
  queueMicrotask(async () => {
    try { const data = await photo('silver-runway.webp'), response = new PassThrough(); response.statusCode = 200; response.headers = { 'content-type': 'image/webp' }; callback(response); response.end(data); request.emit('close'); }
    catch (error) { request.destroy(error); }
  });
  return request;
};
syncBuiltinESMExports();
