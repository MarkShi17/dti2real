import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, body, json, session } from '@/lib/api';
import { imageIdSchema } from '@/lib/schema';
import { storage } from '@/lib/storage';
import { providerStatus } from '@/lib/providers/config';
import { CompatibleVision } from '@/lib/providers/vision';
import { segmentGarments } from '@/lib/providers/segmentation';
import { DEMO_GARMENTS } from '@/lib/fixtures';
import { AppError } from '@/lib/security';
export const runtime = 'nodejs';
export const maxDuration = 240;
export async function POST(req: NextRequest) {
  try {
    const id = await session(req, true), { imageId } = await body(req, z.object({ imageId: imageIdSchema }));
    const provider = providerStatus().vision;
    if (imageId === 'sample') return json({ garments: DEMO_GARMENTS, isDemo: true, provider: 'Sample annotations', note: 'Hand-annotated synthetic example. Boxes are approximate garment regions.' });
    const data = await storage.read(id); if (data.images[imageId]?.kind !== 'screenshot') throw new AppError('Choose an outfit screenshot first.');
    if (provider.mode === 'demo') return json({ garments: [], isDemo: true, provider: 'Manual mode', note: 'Automatic recognition needs a vision API key. Add garments and draw their regions manually, or use the example.' });
    if (provider.mode !== 'live') throw new AppError('Vision settings are incomplete. Configure VISION_API_KEY and VISION_MODEL, or add pieces manually.', 503);
    const image = await storage.getImage(id, imageId);
    const garments = await new CompatibleVision().analyzeOutfit(image);
    const result = await segmentGarments(id, imageId, image, garments);
    return json({ ...result, isDemo: false, provider: provider.name });
  } catch(e) { return apiError(e); }
}
