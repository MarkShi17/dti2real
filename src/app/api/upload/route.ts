import { NextRequest } from 'next/server';
import { apiError, json, session } from '@/lib/api';
import { AppError } from '@/lib/security';
import { storage } from '@/lib/storage';
import { MAX_IMAGE_BYTES } from '@/lib/images';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    const id = await session(req, true);
    // Bound the stream before formData parsing, even for chunked uploads.
    const reader = req.body?.getReader(); if (!reader) throw new AppError('Choose an image.');
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) { const r = await reader.read(); if (r.done) break; bytes += r.value.length; if (bytes > MAX_IMAGE_BYTES + 20000) { await reader.cancel(); throw new AppError('Use an image under 8 MB.', 413); } chunks.push(r.value); }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData();
    const file = form.get('file'), kind = form.get('kind');
    if (kind !== 'person' && kind !== 'face' && kind !== 'screenshot') throw new AppError('Choose a screenshot, person photo, or face reference.');
    if (!(file instanceof File)) throw new AppError('Choose a PNG, JPEG, WebP or AVIF image.');
    if ((kind === 'person' || kind === 'face') && form.get('consent') !== 'true') throw new AppError('Confirm that this is your photo or you have the person’s permission.');
    const ref = await storage.putImage(id, Buffer.from(await file.arrayBuffer()), kind);
    return json(ref, 201);
  } catch(e) { return apiError(e); }
}
