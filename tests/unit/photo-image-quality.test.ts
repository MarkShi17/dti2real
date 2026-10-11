import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { storage } from '@/lib/storage';
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'dti-photo-quality-')); vi.stubEnv('DATA_DIR', directory); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
it.each(['render', 'product'] as const)('preserves original decoded fabric pixels when saving a %s image', async kind => {
  const pixels = Buffer.alloc(128 * 128 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + Math.floor(i / 384) * 19) % 256;
  const original = await sharp(pixels, { raw: { width: 128, height: 128, channels: 3 } }).png().toBuffer();
  const session = await storage.create();
  const ref = await storage.putImage(session, original, kind);
  const saved = await sharp(await storage.getImage(session, ref.id)).removeAlpha().raw().toBuffer();
  expect(saved.equals(pixels)).toBe(true);
});
