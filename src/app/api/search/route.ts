import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, body, json, session } from '@/lib/api';
import { garmentSchema, filtersSchema, imageIdSchema } from '@/lib/schema';
import { visualRerank } from '@/lib/providers/rerank';
import { providerStatus } from '@/lib/providers/config';
import { liveSearch } from '@/lib/providers/shopping';
import { demoProducts } from '@/lib/fixtures';
import { filterAndRank, generateQueries } from '@/lib/ranking';
import { storage } from '@/lib/storage';
import { AppError } from '@/lib/security';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  try {
    const id = await session(req, true), input = await body(req, z.object({ garment: garmentSchema, filters: filtersSchema, imageId: imageIdSchema.optional() }));
    const provider = providerStatus().shopping;
    if (provider.mode === 'unavailable') throw new AppError('Shopping credentials are incomplete.', 503);
    const result = provider.mode === 'demo' ? { products: filterAndRank(demoProducts(input.garment), input.garment, input.filters), warnings: [] } : await liveSearch(input.garment, input.filters);
    if (provider.mode === 'live' && process.env.VISUAL_RERANK === 'true' && input.imageId && providerStatus().vision.mode === 'live') {
      try {
        let segmentedImage: Buffer | undefined;
        const segment = input.garment.segmentation;
        if (segment?.sourceImageId === input.imageId) {
          const data = await storage.read(id), ref = data.images[segment.imageId];
          if (ref?.kind === 'segment' && ref.sourceImageId === input.imageId) segmentedImage = await storage.getImage(id, segment.imageId);
        }
        result.products = await visualRerank(result.products, input.garment, await storage.getImage(id, input.imageId), segmentedImage);
      }
      catch(e) { result.warnings.push(`Visual ranking unavailable: ${e instanceof AppError ? e.message : 'Provider failed.'} Showing keyword matches.`); }
    }
    await storage.update(id, d => { for (const p of result.products) d.products[p.id] = p; });
    return json({ ...result, isDemo: provider.mode === 'demo', queries: generateQueries(input.garment) });
  } catch(e) { return apiError(e); }
}
