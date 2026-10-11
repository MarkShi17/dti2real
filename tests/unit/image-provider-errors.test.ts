import { afterEach, expect, it, vi } from 'vitest';
import { providerJson } from '@/lib/providers/http';

afterEach(() => vi.unstubAllGlobals());
it('explains a moderation rejection without blaming credentials or retrying the blocked request', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'moderation_blocked', message: 'Your request was rejected by the safety system. safety_violations=[sexual].' } }), { status: 400 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(providerJson('https://api.openai.com/v1/images/edits', { method: 'POST' }, 30000, 0)).rejects.toThrow(/sexual-content filter.*previous preview is preserved.*different product photo/i);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('shows the image provider rejection reason and never automatically resubmits an image edit', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'The image format does not match its media type.', code: 'invalid_image_format', param: 'images[0]' } }), { status: 400 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(providerJson('https://api.openai.com/v1/images/edits', { method: 'POST' }, 30000, 0)).rejects.toThrow(/invalid_image_format.*image format does not match/i);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('redacts reflected credentials and image bytes from image-provider errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid secret-token and data:image/webp;base64,aGVsbG8=' } }), { status: 400 })));
  await expect(providerJson('https://api.openai.com/v1/images/edits', { headers: { Authorization: 'Bearer secret-token' } }, 30000, 0)).rejects.toThrow(/\[redacted\].*\[image\]/);
});
