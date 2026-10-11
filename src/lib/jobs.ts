import { randomUUID, createHash } from 'node:crypto';
import type { Garment, Job, OutfitInput, PoseId, ProductListing, RenderResult } from './schema';
import { storage, sampleAsset } from './storage';
import { AppError, fetchImage } from './security';
import { providerStatus } from './providers/config';
import { FashnHosted, FashnLocal } from './providers/tryon';
import { FalPose } from './providers/pose';
import { compositionOrder, outfitSignature } from './outfit';
import { demoRender, POSES } from './fixtures';
import { normalizeImage } from './images';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const running = new Map<string, Promise<void>>();
const queueLocks = new Map<string, Promise<unknown>>();
async function serial<T>(id: string, fn: () => Promise<T>) { const p = (queueLocks.get(id) || Promise.resolve()).catch(() => {}).then(fn); queueLocks.set(id, p); try { return await p; } finally { if (queueLocks.get(id) === p) queueLocks.delete(id); } }
export async function readRenderImage(sessionId: string, render: RenderResult) {
  if (render.image.startsWith('/demo/')) return sampleAsset(render.image);
  return storage.getImage(sessionId, render.image.split('/').pop() || '');
}
async function schedule(sessionId: string, key: string, force: boolean, work: (progress: (s: string) => Promise<void>) => Promise<RenderResult>) {
  return serial(sessionId, async () => {
    const data = await storage.read(sessionId);
    const existing = Object.values(data.jobs).find(j => j.key === key && ['queued', 'running'].includes(j.status) && Date.now() - j.createdAt < 600000);
    if (existing) return { job: existing, run: async () => {} };
    const cached = !force && data.cache[key] && data.renders[data.cache[key]];
    if (cached) return { job: { id: randomUUID(), key, status: 'completed', progress: 'Loaded cached preview', createdAt: Date.now(), result: cached } satisfies Job, run: async () => {} };
    if (Object.values(data.jobs).some(j => ['queued', 'running'].includes(j.status) && Date.now() - j.createdAt < 600000)) throw new AppError('A render is already running in this session. Wait for it to finish.', 409);
    const job: Job = { id: randomUUID(), key, status: 'queued', progress: 'Preparing your wardrobe', createdAt: Date.now() };
    await storage.update(sessionId, d => { d.jobs[job.id] = job; });
    const run = async () => {
      if (running.has(job.id)) return;
      const promise = (async () => {
        try {
          const progress = async (s: string) => { await storage.update(sessionId, d => { d.jobs[job.id].status = 'running'; d.jobs[job.id].progress = s; }); };
          await progress('Preparing your wardrobe');
          const result = await work(progress);
          await storage.update(sessionId, d => { d.renders[result.id] = result; d.cache[key] = result.id; d.jobs[job.id] = { ...job, status: 'completed', progress: 'Your preview is ready', result }; });
        } catch (e) {
          await storage.update(sessionId, d => { d.jobs[job.id] = { ...job, status: 'failed', progress: 'Render stopped', error: e instanceof AppError ? e.message : 'Rendering failed. Your last preview is preserved. Please retry.' }; }).catch(() => {});
        }
      })();
      running.set(job.id, promise); try { await promise; } finally { running.delete(job.id); }
    };
    return { job, run };
  });
}
function selectedGarments(garments: Garment[], products: ProductListing[]) {
  const map = Object.fromEntries(products.map(p => [p.garmentId, p]));
  if (products.length !== Object.keys(map).length) throw new AppError('Choose one product per garment.');
  if (products.some(p => !garments.some(g => g.visible && g.id === p.garmentId))) throw new AppError('A selected listing no longer belongs to a visible garment.');
  const pieces = compositionOrder(garments);
  if (!pieces.length || pieces.some(g => !map[g.id])) throw new AppError('Select a product for each visible top and bottom, or for a dress.');
  return pieces.map(g => ({ garment: g, product: map[g.id] }));
}
export async function queueTryon(sessionId: string, input: OutfitInput) {
  const status = providerStatus().tryon, data = await storage.read(sessionId);
  if (status.mode === 'unavailable') throw new AppError('Try-on provider credentials are incomplete. Check your environment settings.', 503);
  const products = input.productIds.map(id => data.products[id]);
  if (products.some(p => !p)) throw new AppError('One selected product expired. Search for that piece again.');
  const pieces = selectedGarments(input.garments, products);
  if (input.retryGarmentId && !pieces.some(p => p.garment.id === input.retryGarmentId)) throw new AppError('Only a selected top, bottom or dress can be retried.');
  const person = input.personId === 'studio' ? { hash: 'studio-v1' } : data.images[input.personId];
  if (!person || ('kind' in person && person.kind !== 'person')) throw new AppError('Choose a studio model or upload a consenting person photo.');
  const selection = Object.fromEntries(products.map(p => [p.garmentId, p.id]));
  const outfitKey = outfitSignature(input.personId, selection, input.garments);
  let variant: 'silver' | 'burgundy' = 'silver';
  if (status.mode === 'demo') {
    if (input.personId !== 'studio') throw new AppError('Personal-photo try-on needs FASHN hosted credentials or the local GPU worker. No sample image will be substituted for your photo.', 503);
    const top = pieces.find(p => p.garment.category === 'top')?.product, bottom = pieces.find(p => p.garment.category === 'bottom')?.product;
    if (top?.id !== 'fixture-demo-top-0' || !['fixture-demo-bottom-0', 'fixture-demo-bottom-1'].includes(bottom?.id || '')) throw new AppError('This sample preview supports Midnight knit with Silver pleats or the burgundy skirt. Other selections need live try-on.', 422);
    variant = bottom?.variant || 'silver';
  } else if (products.some(p => p.isDemo)) throw new AppError('Live try-on needs real product listings. Configure shopping and search again; sample detail crops are not live garments.', 422);
  const key = digest([person.hash, products.map(p => [p.id, p.imageUrl]), pieces.map(p => p.garment.category), status.name, 'tryon-v1.6-quality-v1', outfitKey]);
  return schedule(sessionId, key, input.force || !!input.retryGarmentId, async progress => {
    const resultId = randomUUID();
    const common = { id: resultId, baseRenderId: resultId, createdAt: new Date().toISOString(), pose: input.personId === 'studio' ? 'runway' as const : 'original' as const, provider: status.name, outfitKey, personId: input.personId, productIds: input.productIds };
    if (status.mode === 'demo') return { ...common, image: demoRender('runway', variant), isDemo: true, provider: 'Created studio sample', note: 'Pre-rendered sample outfit. Shoes are part of the sample styling; bag and jewelry are shopping references only. This is not a live try-on.' };
    const provider = status.name === 'fashn_local' ? new FashnLocal() : new FashnHosted();
    let image = await storage.getImage(sessionId, input.personId);
    let chain = person.hash;
    let refreshLayer = input.force;
    for (const { garment, product } of pieces) {
      // A changed lower layer also invalidates every garment rendered on top of it.
      if (garment.id === input.retryGarmentId) refreshLayer = true;
      await progress(`Trying on ${garment.name.toLowerCase()}`);
      const category = garment.category === 'dress' ? 'one-pieces' : garment.category === 'bottom' ? 'bottoms' : 'tops';
      chain = digest([chain, product.id, product.imageUrl, category, status.name, 'v1-quality']);
      const fresh = await storage.read(sessionId), cachedId = fresh.cache[`layer:${chain}`];
      if (!refreshLayer && cachedId && fresh.images[cachedId]) { image = await storage.getImage(sessionId, cachedId); continue; }
      const garmentImage = (await normalizeImage(await fetchImage(product.imageUrl))).data;
      image = await provider.render({ personImage: image, garmentImage, category, seed: refreshLayer ? Math.floor(Math.random() * 2147483647) : 42 });
      const ref = await storage.putImage(sessionId, image, 'render');
      await storage.update(sessionId, d => { d.cache[`layer:${chain}`] = ref.id; });
      image = await storage.getImage(sessionId, ref.id);
    }
    const ref = await storage.putImage(sessionId, image, 'render');
    return { ...common, image: ref.url, isDemo: false, note: 'AI style visualization; sizing, drape and identity are approximate. Shoes, layers, bags and jewelry are shopping references only. Original input pose is preserved.' };
  });
}
export async function queuePose(sessionId: string, renderId: string, pose: PoseId) {
  const data = await storage.read(sessionId), source = data.renders[renderId];
  if (!source) throw new AppError('Render not found in this session.', 404);
  const status = providerStatus().pose;
  if (!source.isDemo && status.mode !== 'live') throw new AppError('Pose editing is not configured. Your try-on remains available in the photo’s original pose.', 503);
  const key = digest([source.outfitKey, source.id, pose, source.isDemo ? 'demo-v1' : status.name, process.env.POSE_MODEL || 'fal-ai/flux-2/klein/9b/edit']);
  return schedule(sessionId, key, false, async progress => {
    await progress(`Creating ${POSES.find(p => p.id === pose)?.name.toLowerCase()}`);
    if (source.isDemo) return { ...source, id: randomUUID(), pose, image: demoRender(pose, source.image.includes('burgundy') ? 'burgundy' : 'silver'), createdAt: new Date().toISOString() };
    const provider = new FalPose();
    const output = await provider.render({ wardrobeImage: await readRenderImage(sessionId, source), identityReference: await storage.getImage(sessionId, source.personId), posePresetReference: await sampleAsset(`/demo/base-${pose}.webp`), posePrompt: POSES.find(p => p.id === pose)!.prompt, pose });
    const ref = await storage.putImage(sessionId, output, 'render');
    return { ...source, id: randomUUID(), pose, image: ref.url, provider: `fal / ${process.env.POSE_MODEL || 'FLUX.2 klein'}`, createdAt: new Date().toISOString(), note: 'AI pose preview. Likeness, clothing details and body proportions may change. This is not a sizing simulation.' };
  });
}
