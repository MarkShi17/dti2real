import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, body, json, session } from '@/lib/api';
import { garmentSchema, imageIdSchema } from '@/lib/schema';
import { segmentGarments, segmentationStatus } from '@/lib/providers/segmentation';
import { storage } from '@/lib/storage';
import { AppError } from '@/lib/security';
export const runtime = 'nodejs';
export const maxDuration = 180;
export async function POST(req: NextRequest) {
  try {
    const id = await session(req, true);
    const { imageId, garments } = await body(req, z.object({ imageId: imageIdSchema, garments: z.array(garmentSchema).min(1).max(16) }));
    const data = await storage.read(id);
    if (data.images[imageId]?.kind !== 'screenshot') throw new AppError('Choose an uploaded outfit screenshot first.');
    if (segmentationStatus().mode !== 'live') throw new AppError('Pixel segmentation needs a configured SAM worker. You can still redraw regions manually.', 503);
    return json(await segmentGarments(id, imageId, await storage.getImage(id, imageId), garments));
  } catch (e) { return apiError(e); }
}
