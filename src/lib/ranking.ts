import type { Filters, Garment, ProductListing } from './schema';
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, ' ').split(/\s+/).filter(w => w.length > 2);
const overlap = (query: string[], haystack: string) => query.length ? query.filter(w => haystack.includes(w)).length / query.length : 0;
const synonyms: Record<string, string[]> = { top: ['top', 'sweater', 'knit', 'shirt', 'corset', 'blouse', 'turtleneck'], bottom: ['skirt', 'pants', 'jeans', 'trousers', 'shorts'], dress: ['dress', 'jumpsuit', 'romper'], outerwear: ['jacket', 'coat', 'cardigan', 'blazer'], shoes: ['boots', 'heels', 'shoes', 'sneakers'], bag: ['bag', 'purse', 'tote', 'baguette'], jewelry: ['chain', 'necklace', 'pendant', 'earrings'], hosiery: ['tights', 'stockings', 'socks'] };
export function generateQueries(g: Garment): string[] {
  const a = g.attributes;
  const core = [a.color.join(' '), g.name, a.silhouette, a.material, a.pattern].filter(Boolean).join(' ').replace(/\b(roblox|dress to impress|dti)\b/gi, '').trim();
  return [...new Set([...g.searchQueries, core, [a.color.join(' '), a.silhouette, g.category, ...(a.details || [])].filter(Boolean).join(' ')])].filter(Boolean).slice(0, 3);
}
export function scoreListing(p: ProductListing, g: Garment): number {
  const title = p.title.toLowerCase(), a = g.attributes;
  const category = (synonyms[g.category] || [g.category]).some(w => title.includes(w)) ? 1 : 0;
  return Math.round(100 * (.3 * category + .25 * overlap(words(a.silhouette || g.name), title) + .2 * overlap(a.color.map(c => c.toLowerCase()), title) + .15 * overlap(words([a.material, a.pattern].filter(Boolean).join(' ')), title) + .1 * overlap(words((a.aesthetic || []).join(' ')), title)));
}
export function canonicalUrl(raw: string): string {
  const u = new URL(raw); u.hash = ''; for (const key of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid)/.test(key)) u.searchParams.delete(key);
  return u.href;
}
export function filterAndRank(products: ProductListing[], g: Garment, f: Filters): ProductListing[] {
  const seen = new Set<string>();
  return products.filter(p => {
    if (f.priceMax !== undefined && (p.price === undefined || p.currency !== 'USD' || p.price > f.priceMax)) return false;
    if (f.secondhandOnly && p.condition !== 'used') return false;
    if (f.marketplaces.length && !f.marketplaces.includes(p.source)) return false;
    const key = canonicalUrl(p.productUrl); if (seen.has(key)) return false; seen.add(key);
    return true;
  }).map(p => p.matchReason?.startsWith('Visual') ? p : ({ ...p, matchScore: scoreListing(p, g), matchReason: 'Style score from category, color, cut and material keywords; not an image similarity percentage.' })).sort((a, b) => {
    if (f.sortBy !== 'best_match') {
      if (a.price === undefined || a.currency !== 'USD') return 1;
      if (b.price === undefined || b.currency !== 'USD') return -1;
      return f.sortBy === 'price_low' ? a.price - b.price : b.price - a.price;
    }
    return (b.matchScore || 0) - (a.matchScore || 0);
  });
}
