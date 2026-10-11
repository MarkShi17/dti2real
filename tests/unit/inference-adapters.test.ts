import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fashnPrediction, FashnLocal } from '@/lib/providers/tryon';
import { FalPose } from '@/lib/providers/pose';
import { providerJson } from '@/lib/providers/http';
vi.mock('@/lib/providers/http', () => ({ providerJson: vi.fn() }));
const request = vi.mocked(providerJson);
beforeEach(() => { vi.useFakeTimers(); request.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('submits FASHN once and polls until an actual output is returned', async () => {
  request.mockResolvedValueOnce({ id: 'prediction' }).mockResolvedValueOnce({ status: 'processing' }).mockResolvedValueOnce({ status: 'completed', output: ['data:image/png;base64,aW1hZ2U='] });
  const result = fashnPrediction('tryon-v1.6', { category: 'tops' }, 'test-token');
  const assertion = expect(result).resolves.toEqual(Buffer.from('image'));
  await vi.advanceTimersByTimeAsync(4000); await assertion;
  expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(request.mock.calls[0][3]).toBe(0);
});
it('does not turn a completed response without an image into a successful generation', async () => {
  request.mockResolvedValueOnce({ id: 'prediction' }).mockResolvedValueOnce({ status: 'completed', output: [] });
  const assertion = expect(fashnPrediction('tryon-v1.6', {}, 'test-token')).rejects.toThrow('without an image');
  await vi.advanceTimersByTimeAsync(2000); await assertion;
});
it('stops polling failed FASHN jobs', async () => {
  request.mockResolvedValueOnce({ id: 'prediction' }).mockResolvedValueOnce({ status: 'failed' });
  const assertion = expect(fashnPrediction('tryon-v1.6', {}, 'test-token')).rejects.toThrow('could not render');
  await vi.advanceTimersByTimeAsync(2000); await assertion; expect(request).toHaveBeenCalledTimes(2);
});
it('authenticates the private local worker and validates its response', async () => {
  vi.stubEnv('FASHN_LOCAL_URL', 'http://worker:8080/'); vi.stubEnv('FASHN_LOCAL_TOKEN', 'test-token');
  request.mockResolvedValue({ status: 'completed' });
  await expect(new FashnLocal().render({ personImage: Buffer.from('p'), garmentImage: Buffer.from('g'), category: 'tops' })).rejects.toThrow('no image');
  expect(request.mock.calls[0][0]).toBe('http://worker:8080/render');
  expect(request.mock.calls[0][1]?.headers).toHaveProperty('Authorization', 'Bearer test-token');
});
it('rejects a pose provider queue pointing to another host before requesting it', async () => {
  request.mockResolvedValue({ request_id: 'x', status_url: 'https://127.0.0.1/status', response_url: 'https://queue.fal.run/response' });
  await expect(new FalPose().render({ wardrobeImage: Buffer.from('w'), identityReference: Buffer.from('i'), posePresetReference: Buffer.from('p'), posePrompt: 'peace sign', pose: 'peace' })).rejects.toThrow('invalid queue URL');
  expect(request).toHaveBeenCalledTimes(1);
});
