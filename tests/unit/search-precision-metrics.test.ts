import { it, expect } from 'vitest';
import { measure } from '../../scripts/search-precision/metrics.mjs';
import { assertRetrievalAvailable, assertVerificationAvailable } from '../../scripts/search-precision/integrity.mjs';
it('refuses outage checkpoints on both initial validation and resume', () => {
  const retrieval = { queries: ['first', 'second'], errors: ['timeout', 'upstream failure'], products: [] };
  expect(() => assertRetrievalAvailable(retrieval)).toThrow('unavailable evidence');
  expect(() => assertRetrievalAvailable(JSON.parse(JSON.stringify(retrieval)))).toThrow('unavailable evidence');
  const missing = { products: [], decisions: [], warnings: ['Provider failed'] };
  expect(() => assertVerificationAvailable({ products: [{}] }, missing)).toThrow('unavailable evidence');
  expect(() => assertVerificationAvailable({ products: [{}] }, JSON.parse(JSON.stringify(missing)))).toThrow('unavailable evidence');
});
it('distinguishes genuine empty results and partial retrieval from a complete outage', () => {
  expect(() => assertRetrievalAvailable({ queries: ['first', 'second'], errors: ['one query failed'] })).not.toThrow();
  expect(() => assertVerificationAvailable({ products: [] }, { decisions: [] })).not.toThrow();
});
it('does not reward empty result sets with perfect precision or omit them from target coverage', () => {
  const empty = { retrieval: [], verified: [], grades: [] };
  expect(measure([empty, empty], 'verified')).toMatchObject({ targets: 2, displayed: 0, faithfulPrecision: null, faithfulPerAvailableSlot: 0, top1: 0, top3: 0, covered: 0 });
});
it('keeps unavailable and ambiguous photos in the displayed denominator without crediting them', () => {
  const products = ['a', 'b', 'c'].map(productUrl => ({ productUrl }));
  const result = measure([{ retrieval: products, verified: products, grades: [{ productUrl: 'a', grade: 3, uncertain: true }, { productUrl: 'b', grade: 3, uncertain: false }] }], 'verified');
  expect(result).toMatchObject({ displayed: 3, faithful: 1, faithfulPrecision: 1 / 3, top1: 0, top3: 1, unjudgeable: 2 });
});
it('grades only the returned top three and matches by URL rather than position', () => {
  const products = ['a', 'b', 'c', 'd'].map(productUrl => ({ productUrl }));
  const result = measure([{ retrieval: products, verified: [], grades: [{ productUrl: 'd', grade: 3, uncertain: false }, { productUrl: 'b', grade: 2, uncertain: false }, { productUrl: 'a', grade: 3, uncertain: false }] }], 'retrieval');
  expect(result).toMatchObject({ faithful: 1, close: 2, displayed: 3, top1: 1, top3: 1 });
});
