import sharp from 'sharp';
import { z } from 'zod';
import type { Garment, ProviderInfo } from '../schema';
import { dataUri, decodeDataUri } from '../images';
import { storage } from '../storage';
import { AppError } from '../security';
import { providerJson } from './http';

export function segmentationStatus(): ProviderInfo {
  const enabled = process.env.DEMO_MODE !== 'true' && !!process.env.SEGMENTATION_URL;
  return { name: 'SAM 2.1', mode: !enabled ? 'demo' : process.env.SEGMENTATION_TOKEN ? 'live' : 'unavailable', detail: enabled ? 'Your screenshot and garment regions are sent to your private SAM worker for pixel masks. Small accessories may need manual regions.' : 'Pixel masks are off. Recognition returns approximate editable boxes.' };
}
const responseSchema = z.object({ model: z.string().min(1).max(120), segments: z.array(z.object({ id: z.string().min(1).max(80), mask: z.string().max(8_000_000), score: z.number().finite().min(0).max(1) })).max(16) });

/** The worker is administrator-configured, never supplied by a request. Its images still require validation. */
export async function segmentGarments(sessionId: string, imageId: string, image: Buffer, garments: Garment[]): Promise<{ garments: Garment[]; note: string }> {
  // Never carry an old source's masks into a retry or a changed region.
  const clean = garments.map(g => { const copy = { ...g }; delete copy.segmentation; return copy; });
  const mode = segmentationStatus().mode;
  if (mode === 'demo') return { garments: clean, note: 'AI-detected approximate boxes. Pixel segmentation is not configured; review each piece.' };
  try {
    if (mode !== 'live') throw new AppError('Configure SEGMENTATION_TOKEN.', 503);
    // On rendered avatars SAM can confidently segment the skin underneath a necklace.
    // Keep jewelry as editable regions until a jewelry-aware model has been validated.
    const candidates = clean.filter(g => g.bbox && g.visible && g.category !== 'jewelry');
    if (!candidates.length) return { garments: clean, note: 'Jewelry uses manual regions because its pixel masks are unreliable. For clothing, draw a region before refining its mask.' };
    const raw = await providerJson(`${process.env.SEGMENTATION_URL!.replace(/\/$/, '')}/segment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SEGMENTATION_TOKEN}` },
      body: JSON.stringify({ image: dataUri(image), garments: candidates.map(g => ({ id: g.id, category: g.category, bbox: g.bbox })) })
    }, 120000, 0);
    const result = responseSchema.parse(raw);
    const { width, height } = await sharp(image).metadata();
    if (!width || !height) throw new Error('Source dimensions missing');
    const seen = new Set<string>();
    // Validate every returned mask before saving any, avoiding partially accepted malformed responses.
    const accepted = await Promise.all(result.segments.map(async s => {
      const g = candidates.find(g => g.id === s.id);
      if (!g || seen.has(s.id)) throw new Error('Unrequested or duplicate mask');
      seen.add(s.id);
      if (s.score < .65) return null;
      const mask = decodeDataUri(s.mask);
      const decoder = sharp(mask, { limitInputPixels: 2_560_000 });
      const meta = await decoder.metadata();
      if (meta.format !== 'png' || meta.width !== width || meta.height !== height || (meta.pages || 1) !== 1) throw new Error('Mask dimensions or format mismatch');
      const alpha = await decoder.removeAlpha().greyscale().threshold(127).raw().toBuffer();
      let count = 0, left = width, top = height, right = 0, bottom = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (alpha[y * width + x]) { count++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
      if (count < 16 || count > width * height * .9) return null;
      const rgb = await sharp(image).removeAlpha().raw().toBuffer();
      const cutout = await sharp(rgb, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).webp({ quality: 95 }).toBuffer();
      return { g, score: s.score, cutout, bbox: { x: left / width, y: top / height, w: (right - left + 1) / width, h: (bottom - top + 1) / height } };
    }));
    for (const s of accepted) if (s) {
      const ref = await storage.putImage(sessionId, s.cutout, 'segment');
      await storage.update(sessionId, d => { d.images[ref.id].sourceImageId = imageId; });
      s.g.bbox = s.bbox;
      s.g.segmentation = { imageId: ref.id, sourceImageId: imageId, score: s.score, model: result.model };
    }
    const count = clean.filter(g => g.segmentation).length;
    return { garments: clean, note: `${count} of ${clean.length} pieces have SAM pixel masks. ${count < clean.length ? 'Other pieces retain approximate boxes; refine or redraw uncertain regions. ' : ''}Review edges before searching. Model scores are estimates, not measured accuracy.` };
  } catch (e) {
    return { garments: clean.map(g => { const copy = { ...g }; delete copy.segmentation; return copy; }), note: `Pixel masks unavailable: ${e instanceof AppError ? e.message : 'The worker returned invalid masks.'} Approximate boxes are still editable.` };
  }
}
