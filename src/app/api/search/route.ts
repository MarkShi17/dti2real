import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, body, json, session } from '@/lib/api';
import { garmentSchema, filtersSchema, imageIdSchema } from '@/lib/schema';
import { verifyProductMatches } from '@/lib/providers/matching';
import { visualRerank } from '@/lib/providers/rerank';
import { providerStatus } from '@/lib/providers/config';
import { liveSearch } from '@/lib/providers/shopping';
import { demoProducts } from '@/lib/fixtures';
import { filterAndRank, generateQueries } from '@/lib/ranking';
import { storage } from '@/lib/storage';
import { AppError } from '@/lib/security';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  try {
    const id = await session(req, true), input = await body(req, z.object({ garment: garmentSchema, filters: filtersSchema, imageId: imageIdSchema.optional() }));
    const provider = providerStatus().shopping;
    if (provider.mode === 'unavailable') throw new AppError('Shopping credentials are incomplete.', 503);
    const strictMatching = provider.mode === 'live' && process.env.STRICT_SHOPPING_MATCH !== 'false';
    let missingReference = strictMatching && (!input.imageId || providerStatus().vision.mode !== 'live');
    let screenshot: Buffer | undefined;
    if (strictMatching && !missingReference) {
      try { screenshot = await storage.getImage(id, input.imageId!); }
      catch { missingReference = true; }
    }
    const result = missingReference
      ? { products: [], warnings: [providerStatus().vision.mode !== 'live' ? 'Photo matching is unavailable. No unverified listings are shown.' : 'The original outfit screenshot is unavailable. Upload it again to verify listing photos.'] }
      : provider.mode === 'demo' ? { products: filterAndRank(demoProducts(input.garment), input.garment, input.filters), warnings: [] } : await liveSearch(input.garment, input.filters);
    if (strictMatching && !missingReference) {
      const checked = await verifyProductMatches(result.products, input.garment, screenshot);
      result.products = checked.products;
      result.warnings.push(...checked.warnings);
    } else if (!strictMatching && provider.mode === 'live' && process.env.VISUAL_RERANK === 'true' && input.imageId && providerStatus().vision.mode === 'live') {
      try { result.products = await visualRerank(result.products, input.garment, await storage.getImage(id, input.imageId)); }
      catch(e) { result.warnings.push('Visual ranking unavailable: '+(e instanceof AppError ? e.message : 'Provider failed.')+' Showing keyword matches.'); }
    }
    await storage.update(id, d => {
      if (strictMatching) for (const [key, p] of Object.entries(d.products)) if (p.garmentId === input.garment.id) delete d.products[key];
      for (const p of result.products) d.products[p.id] = p;
    });
    return json({ ...result, strictMatching, isDemo: provider.mode === 'demo', queries: generateQueries(input.garment) });
  } catch(e) { return apiError(e); }
}
