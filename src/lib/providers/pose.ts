import { z } from 'zod';
import { dataUri, decodeDataUri } from '../images';
import { AppError, fetchImage } from '../security';
import { providerJson } from './http';
import type { PoseInput, PoseProvider } from './types';
function queueUrl(value: string) {
  const u = new URL(value); if (u.origin !== 'https://queue.fal.run' || u.username || u.password) throw new AppError('Pose provider returned an invalid queue URL.', 502); return u.href;
}
export class FluxLocalPose implements PoseProvider {
  async render(input: PoseInput): Promise<Buffer> {
    const url = `${(process.env.POSE_LOCAL_URL || '').replace(/\/$/, '')}/pose`;
    const result = await providerJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.POSE_LOCAL_TOKEN || ''}` }, body: JSON.stringify({ wardrobe_image: dataUri(input.wardrobeImage), identity_image: dataUri(input.identityReference), pose_image: dataUri(input.posePresetReference), pose: input.pose, pose_prompt: input.posePrompt, seed: 42 }) }, 240000, 0);
    const parsed = z.object({ image: z.string() }).safeParse(result);
    if (!parsed.success) throw new AppError('Local pose editor returned no image. Your last preview is preserved.', 502);
    return decodeDataUri(parsed.data.image);
  }
}
export class FalPose implements PoseProvider {
  async render(input: PoseInput): Promise<Buffer> {
    const model = process.env.POSE_MODEL || 'fal-ai/flux-2/klein/9b/edit';
    if (!/^[a-zA-Z0-9/_-]+$/.test(model)) throw new AppError('Invalid POSE_MODEL setting.', 503);
    const headers = { Authorization: `Key ${process.env.POSE_API_KEY}`, 'Content-Type': 'application/json' };
    const submitted = z.object({ request_id: z.string(), status_url: z.string(), response_url: z.string() }).safeParse(await providerJson(`https://queue.fal.run/${model}`, { method: 'POST', headers, body: JSON.stringify({ image_urls: [dataUri(input.wardrobeImage), dataUri(input.identityReference), dataUri(input.posePresetReference)], prompt: `Edit image 1 into this pose: ${input.posePrompt}. Image 2 is the identity reference: preserve this adult person's recognizable face and proportions. Image 3 is ONLY a pose reference. Keep the exact clothes, colors, textures and footwear from image 1. Do not copy the clothes from images 2 or 3. Photoreal full body head to toe, studio background, natural hands. Do not add text.`, num_images: 1, output_format: 'png', enable_safety_checker: true }) }, 30000, 0));
    if (!submitted.success) throw new AppError('Pose provider did not accept the job.', 502);
    const statusUrl = queueUrl(submitted.data.status_url), responseUrl = queueUrl(submitted.data.response_url);
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = z.object({ status: z.string() }).safeParse(await providerJson(statusUrl, { headers }, 15000));
      if (!status.success) throw new AppError('Pose provider returned an invalid status.', 502);
      if (status.data.status === 'COMPLETED') {
        const result = z.object({ images: z.array(z.object({ url: z.string() })).min(1), has_nsfw_concepts: z.array(z.boolean()).optional() }).safeParse(await providerJson(responseUrl, { headers }));
        if (!result.success || result.data.has_nsfw_concepts?.some(Boolean)) throw new AppError('Pose provider could not return a usable image. Your original-pose try-on is preserved.', 502);
        const output = result.data.images[0].url; return output.startsWith('data:') ? decodeDataUri(output) : fetchImage(output);
      }
      if (['FAILED', 'CANCELLED'].includes(status.data.status)) throw new AppError('Pose editing failed. Your original-pose try-on is preserved.', 502);
    }
    throw new AppError('Pose editing timed out. Your previous preview is preserved; a retry may incur another charge.', 504);
  }
}
