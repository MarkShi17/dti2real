import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Filters, Garment, ProductListing } from '../schema';
import { AppError, safeExternalUrl } from '../security';
import { generateQueries, filterAndRank, broadSearchQuery } from '../ranking';
import { providerJson } from './http';
import type { ShoppingProvider } from './types';
import { selectedShoppingSources, shoppingSourceReady, SerperShopping, ResaleShopping, SerpEbayShopping } from './resale';
const stableId = (g: string, url: string) => createHash('sha256').update(`${g}|${url}`).digest('hex').slice(0, 32);
const entry = z.object({ title: z.string(), source: z.string().optional(), link: z.string().optional(), product_link: z.string().optional(), thumbnail: z.string().optional(), price: z.string().optional(), extracted_price: z.number().nonnegative().optional(), second_hand_condition: z.string().optional() }).passthrough();
export function parseShoppingResults(raw: unknown, garment: Garment): ProductListing[] {
  const parsed = z.object({ shopping_results: z.array(z.unknown()) }).safeParse(raw);
  if (!parsed.success) {
    if (typeof raw === 'object' && raw && 'error' in raw && typeof raw.error === 'string' && /hasn't returned any results|no results/i.test(raw.error)) return [];
    throw new AppError('Shopping provider returned a malformed response. Retry the search.', 502);
  }
  return parsed.data.shopping_results.flatMap(item => {
    const p = entry.safeParse(item); if (!p.success) return [];
    const v = p.data, productUrl = safeExternalUrl(v.product_link) || safeExternalUrl(v.link), imageUrl = safeExternalUrl(v.thumbnail);
    if (!productUrl || !imageUrl || !v.source) return [];
    const price = v.extracted_price;
    // SerpApi is requested with gl=us; require an explicit dollar display before calling it USD.
    const currency = v.price && /^(US\s*)?\$/.test(v.price) ? 'USD' : undefined;
    return [{ id: stableId(garment.id, productUrl), garmentId: garment.id, title: v.title, source: v.source, productUrl, imageUrl, price, currency, condition: v.second_hand_condition ? 'used' as const : 'unknown' as const, thrift: !!v.second_hand_condition, retrievedAt: new Date().toISOString(), isDemo: false, category: garment.category }];
  });
}
export class SerpShopping implements ShoppingProvider {
  warnings: string[] = [];
  async searchGarment(g: Garment, _filters: Filters) {
    const search = async (q: string) => {
      const query = new URLSearchParams({ engine: 'google_shopping', q, api_key: process.env.SERPAPI_KEY || '', gl: 'us', hl: 'en' });
      return parseShoppingResults(await providerJson(`https://serpapi.com/search.json?${query}`), g);
    };
    const queries = generateQueries(g).slice(0, 2), results = await Promise.allSettled(queries.map(search));
    const successful = results.filter(r => r.status === 'fulfilled');
    if (!successful.length) throw (results[0] as PromiseRejectedResult).reason;
    if (successful.length < results.length) this.warnings.push('One shopping query failed. Showing matches from the other query.');
    const products = successful.flatMap(r => r.value);
    const broad = broadSearchQuery(g);
    if (!products.length && !queries.includes(broad)) {
      this.warnings.push(`Precise queries found no listings. Trying the broader search “${broad}”.`);
      return search(broad);
    }
    return products;
  }
}
let ebayToken: { token: string; expires: number } | undefined;
async function getEbayToken() {
  if (ebayToken && ebayToken.expires > Date.now()) return ebayToken.token;
  const auth = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
  const raw = await providerJson('https://api.ebay.com/identity/v1/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }) });
  const p = z.object({ access_token: z.string(), expires_in: z.number().positive() }).safeParse(raw);
  if (!p.success) throw new AppError('eBay authorization returned no access token.', 502);
  ebayToken = { token: p.data.access_token, expires: Date.now() + (p.data.expires_in - 60) * 1000 }; return ebayToken.token;
}
export class EbayShopping implements ShoppingProvider {
  async searchGarment(g: Garment, filters: Filters): Promise<ProductListing[]> {
    const query = new URLSearchParams({ q: generateQueries(g)[0], limit: '20' });
    if (filters.secondhandOnly) query.set('filter', 'conditions:{USED}');
    const raw = await providerJson(`https://api.ebay.com/buy/browse/v1/item_summary/search?${query}`, { headers: { Authorization: `Bearer ${await getEbayToken()}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
    const p = z.object({ total: z.number().optional(), itemSummaries: z.array(z.object({ itemId: z.string(), title: z.string(), itemWebUrl: z.string(), image: z.object({ imageUrl: z.string() }).optional(), price: z.object({ value: z.string(), currency: z.string() }).optional(), condition: z.string().optional(), conditionId: z.string().optional() })).optional() }).safeParse(raw);
    if (!p.success || (!p.data.itemSummaries && p.data.total !== 0)) throw new AppError('eBay returned malformed listings.', 502);
    return (p.data.itemSummaries || []).flatMap(v => {
      const productUrl = safeExternalUrl(v.itemWebUrl), imageUrl = safeExternalUrl(v.image?.imageUrl); if (!productUrl || !imageUrl) return [];
      const price = Number(v.price?.value), used = /^used|pre-owned/i.test(v.condition || '') || v.conditionId === '3000';
      return [{ id: stableId(g.id, productUrl), garmentId: g.id, title: v.title, source: 'eBay', productUrl, imageUrl, price: Number.isFinite(price) && price >= 0 ? price : undefined, currency: v.price?.currency, condition: used ? 'used' : /^new/i.test(v.condition || '') ? 'new' : 'unknown', thrift: used, retrievedAt: new Date().toISOString(), isDemo: false, category: g.category }];
    });
  }
}
export async function liveSearch(g: Garment, filters: Filters) {
  const providers: ShoppingProvider[] = [];
  for (const source of selectedShoppingSources()) {
    if (!shoppingSourceReady(source)) throw new AppError('Missing credentials for ' + source + '.', 503);
    providers.push(source === 'serpapi' ? new SerpShopping() : source === 'serpapi_ebay' ? new SerpEbayShopping() : source === 'ebay' ? new EbayShopping() : source === 'serper' ? new SerperShopping() : new ResaleShopping(source));
  }
  if (!providers.length) throw new AppError('Shopping credentials are incomplete.', 503);
  const results = await Promise.allSettled(providers.map(p => p.searchGarment(g, filters)));
  const listings = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const warnings = results.flatMap(r => r.status === 'rejected' ? [r.reason instanceof AppError ? r.reason.message : 'One shopping provider failed.'] : []);
  warnings.push(...providers.flatMap(p => p instanceof SerpShopping ? p.warnings : []));
  if (results.every(r => r.status === 'rejected')) throw new AppError(warnings.join(' '), 502);
  return { products: filterAndRank(listings, g, filters).slice(0, 12), warnings };
}
