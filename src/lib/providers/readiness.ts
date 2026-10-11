import { providerStatus } from './config';
import { providerJson } from './http';
import { z } from 'zod';
const capability = z.object({ ready: z.boolean(), reason: z.string().max(80).optional() });
const healthSchema = z.object({ cuda_available: z.boolean(), tryon: capability, pose: capability });
export async function providerReadiness() {
  const status = providerStatus();
  const checks = new Map<string, Promise<z.infer<typeof healthSchema>>>();
  await Promise.all((['tryon', 'pose'] as const).map(async kind => {
    const provider = status[kind];
    provider.ready = provider.mode !== 'unavailable';
    if (provider.mode !== 'live' || !['fashn_local', 'flux_local'].includes(provider.name)) return;
    const expiry = process.env.GPU_EXPIRES_AT;
    if (expiry) {
      const time = Date.parse(expiry);
      if (Number.isFinite(time)) provider.expiresAt = expiry;
      if (!Number.isFinite(time) || Date.now() >= time) { provider.ready = false; provider.detail = 'The GPU lease has expired. Your saved previews remain available; new photo renders need an active GPU.'; return; }
    }
    const url = (kind === 'tryon' ? process.env.FASHN_LOCAL_URL : process.env.POSE_LOCAL_URL)!.replace(/\/$/, '');
    const token = kind === 'tryon' ? process.env.FASHN_LOCAL_TOKEN : process.env.POSE_LOCAL_TOKEN;
    const key = `${url}:${token}`;
    try {
      if (!checks.has(key)) checks.set(key, providerJson(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } }, 3000, 0).then(v => healthSchema.parse(v)));
      const health = await checks.get(key)!;
      provider.ready = health.cuda_available && health[kind].ready;
      if (!provider.ready) provider.detail = !health.cuda_available ? 'The GPU worker has no working CUDA device. Your last preview is preserved.' : health[kind].reason === 'weights_missing' ? 'The GPU worker is still downloading model weights. Try again when it is ready.' : 'The GPU model is not ready. Your last preview is preserved; check worker status and retry.';
    } catch {
      provider.ready = false; provider.detail = 'The GPU worker is offline or unreachable. Your last preview is preserved. Reconnect the GPU and retry.';
    }
  }));
  return status;
}
