import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { AppError } from './security';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export async function normalizeImage(input: Buffer, maxDimension = 1600, options: { lossless?: boolean } = {}) {
  if (!input.length || input.length > MAX_IMAGE_BYTES) throw new AppError('Use a PNG, JPEG, WebP or AVIF image under 8 MB.', 413);
  try {
    const s = sharp(input, { limitInputPixels: 24_000_000, animated: false });
    const m = await s.metadata();
    if (!(['png', 'jpeg', 'webp'].includes(m.format || '') || (m.format === 'heif' && m.compression === 'av1')) || !m.width || !m.height || m.width < 64 || m.height < 64 || (m.pages || 1) > 1) throw new AppError('Use a still PNG, JPEG, WebP or AVIF image at least 64 × 64 pixels.');
    const { data, info } = await s.rotate().resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true }).webp(options.lossless ? { lossless: true, effort: 0 } : { quality: 92 }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, hash: createHash('sha256').update(data).digest('hex') };
  } catch (e) { if (e instanceof AppError) throw e; throw new AppError('This image could not be decoded or exceeds 24 megapixels.'); }
}
export function dataUri(data: Buffer) { return `data:image/webp;base64,${data.toString('base64')}`; }
export function decodeDataUri(value: string): Buffer {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!m || value.length > 17_000_000) throw new AppError('Provider returned an invalid image.', 502);
  return Buffer.from(m[2], 'base64');
}
