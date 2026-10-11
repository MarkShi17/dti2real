import { z } from 'zod';
import { dataUri, decodeDataUri } from '../images';
import { AppError, fetchImage } from '../security';
import { providerJson } from './http';
import type { TryOnInput, TryOnProvider } from './types';
export async function fashnPrediction(model_name: string, inputs: Record<string, unknown>, key: string): Promise<Buffer> {
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  // No automatic retry on job submission: a timeout may already have incurred a charge.
  const raw = await providerJson('https://api.fashn.ai/v1/run', { method: 'POST', headers, body: JSON.stringify({ model_name, inputs }) }, 30000, 0);
  const submitted = z.object({ id: z.string().min(1).max(160), error: z.unknown().optional() }).safeParse(raw);
  if (!submitted.success || submitted.data.error) throw new AppError('FASHN did not accept the job. Check the model settings.', 502);
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const status = z.object({ status: z.string(), output: z.array(z.string()).optional(), error: z.unknown().optional() }).safeParse(await providerJson(`https://api.fashn.ai/v1/status/${encodeURIComponent(submitted.data.id)}`, { headers }, 15000, 1));
    if (!status.success) throw new AppError('FASHN returned an invalid job status.', 502);
    if (['failed', 'canceled', 'cancelled'].includes(status.data.status)) throw new AppError('FASHN could not render this garment. Try a clearer full-body person photo and product photo.', 502);
    if (status.data.status === 'completed') {
      const output = status.data.output?.[0]; if (!output) throw new AppError('FASHN completed without an image.', 502);
      return output.startsWith('data:') ? decodeDataUri(output) : fetchImage(output);
    }
  }
  throw new AppError('FASHN is taking longer than three minutes. The provider job may still finish; retrying may incur another charge.', 504);
}
export class FashnHosted implements TryOnProvider {
  render(input: TryOnInput) {
    return fashnPrediction('tryon-v1.6', { model_image: dataUri(input.optionalPreviousImage || input.personImage), garment_image: dataUri(input.garmentImage), category: input.category, mode: 'quality', num_samples: 1, output_format: 'png', return_base64: true, seed: input.seed ?? 42 }, process.env.FASHN_API_KEY || '');
  }
}
export class FashnLocal implements TryOnProvider {
  async render(input: TryOnInput): Promise<Buffer> {
    const url = `${(process.env.FASHN_LOCAL_URL || '').replace(/\/$/, '')}/render`;
    const result = await providerJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.FASHN_LOCAL_TOKEN ? { Authorization: `Bearer ${process.env.FASHN_LOCAL_TOKEN}` } : {}) }, body: JSON.stringify({ person_image: dataUri(input.optionalPreviousImage || input.personImage), garment_image: dataUri(input.garmentImage), category: input.category, seed: input.seed ?? 42 }) }, 240000, 0);
    const p = z.object({ image: z.string() }).safeParse(result); if (!p.success) throw new AppError('Local FASHN worker returned no image.', 502);
    return decodeDataUri(p.data.image);
  }
}
