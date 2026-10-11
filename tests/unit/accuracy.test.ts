import { describe, it, expect } from 'vitest';
import { scoreCase, SpendLedger, redact, cacheKey } from '../../scripts/accuracy/core.mjs';
describe('accuracy evaluation', () => {
  const expected = [{ id: 'top', attributes: { color: ['white'] }, bbox: { x: 0, y: 0, w: .5, h: .5 } }, { id: 'skirt', attributes: {} }];
  const predictions = [{ id: 'p1', bbox: { x: 0, y: 0, w: .5, h: .5 } }, { id: 'hallucination' }];
  it('counts missed garments against retrieval success instead of dropping their denominator', () => {
    const result = scoreCase(expected, predictions, { p1: [{ id: 'a' }, { id: 'b' }] }, {
      complete: true, matches: [{ expectedId: 'top', predictionId: 'p1', attributes: { color: true } }],
      products: [{ expectedId: 'top', productId: 'a', grade: 1 }, { expectedId: 'top', productId: 'b', grade: 3 }]
    });
    expect(result).toMatchObject({ truePositives: 1, falsePositives: 1, falseNegatives: 1, precision: .5, recall: .5, f1: .5, top1: 0, top3: .5, meanIoU: 1, attributeAccuracy: 1 });
  });
  it('rejects duplicate matches and incomplete judgments', () => {
    expect(() => scoreCase(expected, predictions, {}, { complete: false })).toThrow(/review/i);
    expect(() => scoreCase(expected, predictions, {}, { complete: true, matches: [
      { expectedId: 'top', predictionId: 'p1' }, { expectedId: 'skirt', predictionId: 'p1' }
    ] })).toThrow(/duplicate/i);
  });
  it('does not turn unreviewed product images into scored failures', () => {
    expect(() => scoreCase(expected, predictions, { p1: [{ id: 'a' }] }, {
      complete: true, matches: [{ expectedId: 'top', predictionId: 'p1', attributes: { color: true } }], products: []
    })).toThrow(/unreviewed/i);
  });
  it('reserves in-flight money and retains uncertain charges across a resume', () => {
    const ledger = new SpendLedger({ cap: 3, pilotCap: 1 });
    ledger.reserve('a', .8, 'pilot');
    expect(() => ledger.reserve('b', .3, 'pilot')).toThrow(/budget/i);
    const resumed = new SpendLedger(ledger.snapshot());
    expect(() => resumed.reserve('c', .3, 'pilot')).toThrow(/budget/i);
    resumed.settle('a', .2);
    resumed.reserve('b', .7, 'pilot');
    expect(resumed.snapshot().entries).toHaveLength(2);
    expect(() => resumed.reserve('c', 3, 'baseline')).toThrow(/budget/i);
    expect(() => resumed.reserve('d', NaN, 'baseline')).toThrow();
  });
  it('redacts credentials recursively without destroying listing provenance', () => {
    expect(redact({ url: 'https://serpapi.com/search?api_key=secret&q=lace', headers: { Authorization: 'Bearer abc', 'X-API-KEY': 'abc' }, image: 'data:image/webp;base64,abc', productUrl: 'https://www.depop.com/products/a/' })).toEqual({
      url: 'https://serpapi.com/search?api_key=%5BREDACTED%5D&q=lace',
      headers: { Authorization: '[REDACTED]', 'X-API-KEY': '[REDACTED]' },
      image: '[IMAGE]', productUrl: 'https://www.depop.com/products/a/'
    });
  });
  it('keys cached calls by request semantics but never by credentials', () => {
    expect(cacheKey('https://example.com/search?api_key=one', { q: 'lace' })).toBe(cacheKey('https://example.com/search?api_key=two', { q: 'lace' }));
    expect(cacheKey('https://example.com/search', { q: 'lace' })).not.toBe(cacheKey('https://example.com/search', { q: 'denim' }));
  });
});

it('stops after a provider exceeds its reservation even across resume', () => {
 const ledger=new SpendLedger({cap:3,pilotCap:1}); ledger.reserve('a',.1,'baseline');
 expect(()=>ledger.settle('a',.2)).toThrow();
 expect(()=>new SpendLedger(ledger.snapshot()).reserve('b',.1,'baseline')).toThrow(/reconcile|exceeded/i);
});

it('reports unavailable image judgments as bounds, never as verified mismatches',()=>{
 const result=scoreCase([{id:'g',attributes:{}}],[{id:'p'}],{p:[{id:'unavailable'}]},{complete:true,matches:[{expectedId:'g',predictionId:'p',attributes:{}}],products:[{expectedId:'g',productId:'unavailable',grade:null}]});
 expect(result).toMatchObject({top1:0,top3:0,top1UpperBound:1,top3UpperBound:1,unreviewableProducts:1});
});
