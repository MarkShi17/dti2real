import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ImageRef, Job, ProductListing, RenderResult, LayeringPlan } from './schema';
import { normalizeImage } from './images';
import { AppError } from './security';
export type SessionData = { createdAt: number; images: Record<string, ImageRef>; products: Record<string, ProductListing>; jobs: Record<string, Job>; renders: Record<string, RenderResult>; cache: Record<string, string>; layeringPlans?: Record<string, LayeringPlan>; state?: unknown };
export interface StorageProvider {
  create(): Promise<string>; read(id: string): Promise<SessionData>; update(id: string, fn: (data: SessionData) => void): Promise<void>;
  putImage(id: string, data: Buffer, kind: ImageRef['kind']): Promise<ImageRef>; getImage(id: string, imageId: string): Promise<Buffer>; delete(id: string): Promise<void>;
}
const root = () => process.env.DATA_DIR || join(process.cwd(), '.data');
const validId = (s: string) => /^[a-f0-9-]{36}$/.test(s);
const locks = new Map<string, Promise<unknown>>();
async function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn); locks.set(id, next);
  try { return await next; } finally { if (locks.get(id) === next) locks.delete(id); }
}
function sessionDir(id: string) { if (!validId(id)) throw new AppError('Session not found.', 401); return join(root(), id); }
export class FileStorage implements StorageProvider {
  async create() {
    await mkdir(root(), { recursive: true, mode: 0o700 });
    // Opportunistic TTL cleanup; also available through scripts/cleanup.mjs.
    for (const entry of await readdir(root())) if (validId(entry)) {
      const dir = sessionDir(entry);
      const info = await readFile(join(dir, 'session.json'), 'utf8').then(v => JSON.parse(v) as SessionData).catch(() => null);
      if (info && Date.now() - info.createdAt > 86400000) await locked(entry, () => rm(dir, { recursive: true, force: true }));
    }
    const id = randomUUID(); await mkdir(sessionDir(id), { mode: 0o700 });
    await writeFile(join(sessionDir(id), 'session.json'), JSON.stringify({ createdAt: Date.now(), images: {}, products: {}, jobs: {}, renders: {}, cache: {} } satisfies SessionData), { mode: 0o600 });
    return id;
  }
  async read(id: string): Promise<SessionData> {
    try {
      const d = JSON.parse(await readFile(join(sessionDir(id), 'session.json'), 'utf8')) as SessionData;
      if (Date.now() - d.createdAt > 86400000) throw new Error('expired');
      return d;
    } catch { throw new AppError('Your session expired. Start a new session to continue.', 401); }
  }
  async update(id: string, fn: (data: SessionData) => void) {
    await locked(id, async () => {
      const d = await this.read(id); fn(d);
      const tmp = join(sessionDir(id), `session-${randomUUID()}.tmp`);
      await writeFile(tmp, JSON.stringify(d), { mode: 0o600 }); await rename(tmp, join(sessionDir(id), 'session.json'));
    });
  }
  async putImage(id: string, input: Buffer, kind: ImageRef['kind']): Promise<ImageRef> {
    const image = await normalizeImage(input);
    return locked(id, async () => {
      const d = await this.read(id);
      if (Object.keys(d.images).length >= 100) throw new AppError('Session image limit reached. Delete this session to start fresh.', 413);
      const imageId = randomUUID();
      const ref: ImageRef = { id: imageId, url: `/api/assets/${imageId}`, width: image.width, height: image.height, hash: image.hash, kind };
      await writeFile(join(sessionDir(id), `${imageId}.webp`), image.data, { mode: 0o600 });
      d.images[imageId] = ref;
      const tmp = join(sessionDir(id), `session-${randomUUID()}.tmp`); await writeFile(tmp, JSON.stringify(d), { mode: 0o600 }); await rename(tmp, join(sessionDir(id), 'session.json'));
      return ref;
    });
  }
  async getImage(id: string, imageId: string): Promise<Buffer> {
    if (imageId === 'sample') return readFile(join(process.cwd(), 'public/demo/sample.webp'));
    if (imageId === 'studio') return readFile(join(process.cwd(), 'public/demo/base-runway.webp'));
    if (imageId === 'sample-fitexample-v1') return readFile(join(process.cwd(), 'public/demo/fitexample-v1/source.webp'));
    const d = await this.read(id); if (!validId(imageId) || !d.images[imageId]) throw new AppError('Image not found in this session.', 404);
    return readFile(join(sessionDir(id), `${imageId}.webp`));
  }
  async delete(id: string) { await locked(id, () => rm(sessionDir(id), { recursive: true, force: true })); }
}
export const storage: StorageProvider = new FileStorage();
export async function sampleAsset(path: string) {
  if (!/^\/avatar\/pose-guides\/(runway|hip|peace|shoulder|lean)\.png$/.test(path) && !/^\/demo\/(base|silver|burgundy)-(runway|hip|peace|shoulder|lean)\.webp$/.test(path) && path !== '/demo/sample.webp' && !/^\/demo\/products\/[a-z-]+\.webp$/.test(path) && !/^\/demo\/fitexample-v1\/(source|before-runway|runway|hip|peace|shoulder|lean)\.webp$/.test(path) && !/^\/demo\/fitexample-v1\/products\/(top|bottom|bag|shoes)\.webp$/.test(path)) throw new AppError('Invalid sample asset.');
  return readFile(join(process.cwd(), 'public', path));
}
