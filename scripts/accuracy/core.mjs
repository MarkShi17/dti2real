import { createHash } from 'node:crypto';

export function boxIoU(a, b) {
  if (!a || !b) return 0;
  const intersection = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const union = a.w * a.h + b.w * b.h - intersection;
  return union > 0 ? intersection / union : 0;
}
export function scoreCase(expected, predictions, rankings, review) {
  if (!review?.complete) throw new Error('Review is incomplete; no accuracy claim can be computed.');
  const matches = review.matches || [], products = review.products || [];
  const refs = new Map(expected.map(p => [p.id, p])), preds = new Map(predictions.map(p => [p.id, p]));
  const seenRef = new Set(), seenPred = new Set();
  for (const m of matches) {
    if (seenRef.has(m.expectedId) || seenPred.has(m.predictionId)) throw new Error('Duplicate garment match.');
    if (!refs.has(m.expectedId) || !preds.has(m.predictionId)) throw new Error('Unknown garment match.');
    seenRef.add(m.expectedId); seenPred.add(m.predictionId);
  }
  const grades = new Map();
  for (const p of products) {
    const key = p.expectedId + '/' + p.productId;
    if (!refs.has(p.expectedId) || grades.has(key) || (p.grade !== null && (!Number.isInteger(p.grade) || p.grade < 0 || p.grade > 3))) throw new Error('Invalid or duplicate product judgment.');
    grades.set(key, p.grade);
  }
  let unknown1 = 0, unknown3 = 0, unreviewableProducts = 0;
  let top1 = 0, top3 = 0, attributeCorrect = 0, attributeTotal = 0;
  const overlaps = [];
  for (const m of matches) {
    const ref = refs.get(m.expectedId), pred = preds.get(m.predictionId);
    if (ref.bbox) overlaps.push(boxIoU(ref.bbox, pred.bbox));
    for (const field of Object.keys(ref.attributes || {})) {
      const answer = m.attributes?.[field];
      if (typeof answer !== 'boolean') throw new Error('Unreviewed attribute: ' + m.expectedId + '.' + field);
      attributeTotal++; if (answer) attributeCorrect++;
    }
    const candidates = (rankings[m.predictionId] || []).slice(0, 3);
    const scores = candidates.map(p => {
      const score = grades.get(m.expectedId + '/' + p.id);
      if (score === undefined) throw new Error('Unreviewed product: ' + p.id);
      return score;
    });
    unreviewableProducts += scores.filter(s => s === null).length;
    if (scores[0] === null) unknown1++;
    if (!scores.includes(3) && scores.includes(null)) unknown3++;
    if (scores[0] === 3) top1++;
    if (scores.includes(3)) top3++;
  }
  const tp = matches.length, fp = predictions.length - tp, fn = expected.length - tp;
  const precision = predictions.length ? tp / predictions.length : 0, recall = expected.length ? tp / expected.length : 0;
  return {
    truePositives: tp, falsePositives: fp, falseNegatives: fn, expected: expected.length, predicted: predictions.length,
    precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    top1: expected.length ? top1 / expected.length : null, top3: expected.length ? top3 / expected.length : null,
    faithfulTop1: top1, faithfulTop3: top3, unreviewableProducts,
    top1UpperBound: expected.length ? (top1 + unknown1) / expected.length : null,
    top3UpperBound: expected.length ? (top3 + unknown3) / expected.length : null, attributeCorrect, attributeTotal,
    attributeAccuracy: attributeTotal ? attributeCorrect / attributeTotal : null,
    meanIoU: overlaps.length ? overlaps.reduce((a,b) => a+b, 0) / overlaps.length : null,
    boxesAtPointFive: overlaps.filter(v => v >= .5).length, matchedBoxes: overlaps.length
  };
}

export class SpendLedger {
  constructor({ cap = 30, pilotCap = 5, entries = [] } = {}) {
    if (!Number.isFinite(cap) || cap <= 0 || cap > 30 || !Number.isFinite(pilotCap) || pilotCap < 0 || pilotCap > cap) throw new Error('Invalid budget.');
    this.cap = cap; this.pilotCap = pilotCap; this.entries = structuredClone(entries);
    for (const e of this.entries) {
      if (!e.id || !Number.isFinite(e.reserved) || e.reserved < 0 || (e.actual !== undefined && (!Number.isFinite(e.actual) || e.actual < 0))) throw new Error('Invalid saved ledger.');
    }
  }
  reserve(id, amount, phase) {
    if (!Number.isFinite(amount) || amount <= 0 || this.entries.some(e => e.id === id)) throw new Error('Invalid or duplicate budget reservation.');
    if (this.entries.some(e => e.status === 'over-reservation')) throw new Error('Provider exceeded reservation; reconcile before continuing.');
    const cost = e => e.actual ?? e.reserved;
    const used = this.entries.reduce((s,e) => s + cost(e), 0);
    const pilot = this.entries.filter(e => e.phase === 'pilot' || e.phase === 'preflight').reduce((s,e) => s + cost(e), 0);
    if (used + amount > this.cap + 1e-9 || (['pilot', 'preflight'].includes(phase) && pilot + amount > this.pilotCap + 1e-9)) throw new Error('Budget limit reached; checkpoint saved.');
    this.entries.push({ id, phase, reserved: amount, status: 'pending' });
  }
  settle(id, amount) {
    const entry = this.entries.find(e => e.id === id);
    if (!entry || entry.status !== 'pending' || !Number.isFinite(amount) || amount < 0) throw new Error('Invalid settlement.');
    entry.actual = amount; entry.status = amount > entry.reserved ? 'over-reservation' : 'settled';
    if (amount > entry.reserved) throw new Error('Provider exceeded its reserved budget; stop and reconcile.');
  }
  snapshot() { return structuredClone({ cap: this.cap, pilotCap: this.pilotCap, entries: this.entries }); }
}

const sensitive = /^(authorization|proxy-authorization|x-api-key|api[-_]?key|access_token|refresh_token|token|cookie|set-cookie|secret|password)$/i;
export function redact(value, secrets = []) {
  if (Array.isArray(value)) return value.map(v => redact(v, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, sensitive.test(k) ? '[REDACTED]' : redact(v, secrets)]));
  if (typeof value !== 'string') return value;
  if (value.startsWith('data:image/')) return '[IMAGE]';
  let result = value;
  try {
    const u = new URL(result);
    for (const key of [...u.searchParams.keys()]) if (sensitive.test(key)) u.searchParams.set(key, '[REDACTED]');
    if (u.username || u.password) { u.username = ''; u.password = ''; }
    result = u.href;
  } catch { /* Not a URL. */ }
  for (const secret of secrets.filter(Boolean)) result = result.split(secret).join('[REDACTED]');
  return result.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  if (typeof value === 'string' && value.startsWith('data:image/')) return '[IMAGE:' + createHash('sha256').update(value).digest('hex') + ']';
  return value;
}
export function cacheKey(url, body) {
  return createHash('sha256').update(JSON.stringify(redact(canonical({ url, body })))).digest('hex');
}
