import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { providerStatus } from '@/lib/providers/config';
import { providerReadiness } from '@/lib/providers/readiness';
import { providerJson } from '@/lib/providers/http';

vi.mock('@/lib/providers/http', () => ({ providerJson: vi.fn() }));
beforeEach(() => {
  vi.stubEnv('DEMO_MODE', 'false'); vi.stubEnv('TRYON_PROVIDER', 'fashn_local');
  vi.stubEnv('FASHN_LOCAL_URL', 'http://worker:8080'); vi.stubEnv('FASHN_LOCAL_TOKEN', 'secret');
  vi.stubEnv('POSE_PROVIDER', 'flux_local'); vi.stubEnv('POSE_LOCAL_URL', 'http://worker:8080');
  vi.stubEnv('POSE_LOCAL_TOKEN', 'secret'); vi.stubEnv('GPU_EXPIRES_AT', '');
  vi.mocked(providerJson).mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); });

it('requires an authentication token for the private try-on worker', () => {
  vi.stubEnv('FASHN_LOCAL_TOKEN', '');
  expect(providerStatus().tryon.mode).toBe('unavailable');
});
it('recognizes the local pose editor without hosted credentials', () => {
  expect(providerStatus().pose).toMatchObject({ name: 'flux_local', mode: 'live' });
});
it('checks real CUDA and model readiness rather than equating a URL with a working worker', async () => {
  vi.mocked(providerJson).mockResolvedValue({ cuda_available: true, tryon: { ready: true }, pose: { ready: false, reason: 'weights_missing' } });
  const status = await providerReadiness();
  expect(status.tryon.ready).toBe(true); expect(status.pose.ready).toBe(false);
  expect(status.pose.detail).toMatch(/weights/i);
  expect(vi.mocked(providerJson).mock.calls[0][1]?.headers).toHaveProperty('Authorization', 'Bearer secret');
});
it('keeps an offline configured worker unavailable to generation without selecting demo', async () => {
  vi.mocked(providerJson).mockRejectedValue(new Error('connection refused'));
  const status = await providerReadiness();
  expect(status.tryon).toMatchObject({ name: 'fashn_local', mode: 'live', ready: false });
  expect(status.tryon.detail).toMatch(/offline|unreachable/i);
});
it('reports an expired GPU lease without making a network request', async () => {
  vi.stubEnv('GPU_EXPIRES_AT', '2020-01-01T00:00:00Z');
  expect((await providerReadiness()).tryon).toMatchObject({ ready: false });
  expect(vi.mocked(providerJson)).not.toHaveBeenCalled();
});
