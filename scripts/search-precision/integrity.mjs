export function assertRetrievalAvailable(result) {
  if (!result.queries?.length || result.errors?.length >= result.queries.length) throw new Error('All retrieval queries failed; this is unavailable evidence, not a zero-match result.');
}
export function assertVerificationAvailable(retrieval, verification) {
  if (retrieval.products.length && !verification.decisions?.length) throw new Error('No photo-verification decisions; this is unavailable evidence, not a zero-match result.');
}
