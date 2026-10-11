import { randomUUID, createHash } from 'node:crypto';
import type { Garment, Job, OutfitInput, PoseId, ProductListing, RenderResult, OutfitProductReference } from './schema';
import { storage, sampleAsset } from './storage';
import { AppError, fetchImage } from './security';
import { providerStatus } from './providers/config';
import { providerReadiness } from './providers/readiness';
import { FashnHosted, FashnLocal } from './providers/tryon';
import { FalPose, FluxLocalPose } from './providers/pose';
import { compositionOrder, outfitSignature } from './outfit';
import { demoRender, POSES } from './fixtures';
import { EXAMPLE_GARMENTS, EXAMPLE_ID, EXAMPLE_PRODUCTS, EXAMPLE_SOURCE_ID, exampleRender, isSupportedExampleOutfit } from './examples';
import { normalizeImage } from './images';
import { poseIdentity } from './pose-identity';
import { avatarProfileSchema } from './avatar/profile';
import { z } from 'zod';
import { OpenAIOutfit, OUTFIT_SETTINGS, OUTFIT_JOB_BUDGET_MS, renderReviewedOutfit, validateLayeringPlan, type ProductReference } from './providers/openai-outfit';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const running = new Map<string, Promise<void>>();
const queueLocks = new Map<string, Promise<unknown>>();
async function serial<T>(id: string, fn: () => Promise<T>) { const p = (queueLocks.get(id) || Promise.resolve()).catch(() => {}).then(fn); queueLocks.set(id, p); try { return await p; } finally { if (queueLocks.get(id) === p) queueLocks.delete(id); } }
export async function readRenderImage(sessionId: string, render: RenderResult) {
  if (render.image.startsWith('/demo/')) return sampleAsset(render.image);
  return storage.getImage(sessionId, render.image.split('/').pop() || '');
}
async function schedule(sessionId: string, key: string, force: boolean, work: (progress: (s: string) => Promise<void>, deadline: number) => Promise<RenderResult>) {
  return serial(sessionId, async () => {
    const data = await storage.read(sessionId);
    const existing = Object.values(data.jobs).find(j => j.key === key && ['queued', 'running'].includes(j.status) && Date.now() - j.createdAt < OUTFIT_JOB_BUDGET_MS);
    if (existing) return { job: existing, run: async () => {} };
    const cached = !force && data.cache[key] && data.renders[data.cache[key]];
    if (cached) return { job: { id: randomUUID(), key, status: 'completed', progress: 'Loaded cached preview', createdAt: Date.now(), result: cached } satisfies Job, run: async () => {} };
    if (Object.values(data.jobs).some(j => ['queued', 'running'].includes(j.status) && Date.now() - j.createdAt < OUTFIT_JOB_BUDGET_MS)) throw new AppError('A render is already running in this session. Wait for it to finish.', 409);
    const job: Job = { id: randomUUID(), key, status: 'queued', progress: 'Preparing your wardrobe', createdAt: Date.now() };
    await storage.update(sessionId, d => { d.jobs[job.id] = job; });
    const run = async () => {
      if (running.has(job.id)) return;
      const promise = (async () => {
        try {
          const progress = async (s: string) => { await storage.update(sessionId, d => {
            if (Date.now() - job.createdAt >= OUTFIT_JOB_BUDGET_MS || !['queued', 'running'].includes(d.jobs[job.id]?.status)) throw new AppError('The render budget expired or the job was interrupted. Your last accepted preview is preserved.', 504);
            d.jobs[job.id].status = 'running'; d.jobs[job.id].progress = s;
          }); };
          await progress('Preparing your wardrobe');
          const result = await work(progress, job.createdAt + OUTFIT_JOB_BUDGET_MS);
          await storage.update(sessionId, d => {
            if (Date.now() - job.createdAt >= OUTFIT_JOB_BUDGET_MS || d.jobs[job.id]?.status !== 'running') throw new AppError('The render was interrupted. Your last accepted preview is preserved.', 504);
            d.renders[result.id] = result; d.cache[key] = result.id;
            if (result.outfit) d.cache[`outfit:${result.outfit.referenceKey}`] = result.id;
            d.jobs[job.id] = { ...job, status: 'completed', progress: 'Your preview is ready', result };
          });
        } catch (e) {
          await storage.update(sessionId, d => { d.jobs[job.id] = { ...job, status: 'failed', progress: 'Render stopped', error: e instanceof AppError ? e.message : 'Rendering failed. Your last preview is preserved. Please retry.' }; }).catch(() => {});
        }
      })();
      running.set(job.id, promise); try { await promise; } finally { running.delete(job.id); }
    };
    return { job, run };
  });
}

async function frozenProductReferences(sessionId: string, pieces: { garment: Garment; product: ProductListing }[], progress: (s: string) => Promise<void>) {
  const references: ProductReference[] = [], saved: OutfitProductReference[] = [];
  for (const { garment, product } of pieces) {
    await progress(`Preparing product reference: ${garment.name}`);
    const key = `product-reference:${digest([product.id, product.imageUrl])}`;
    const data = await storage.read(sessionId), cached = data.images[data.cache[key]];
    const ref = cached?.kind === 'product' ? cached : await storage.putImage(sessionId, (await normalizeImage(await fetchImage(product.imageUrl))).data, 'product');
    if (ref !== cached) await storage.update(sessionId, d => { d.cache[key] = ref.id; });
    references.push({ garment, product, image: await storage.getImage(sessionId, ref.id), hash: ref.hash });
    saved.push({ garment, product, imageId: ref.id, hash: ref.hash });
  }
  return { references, saved };
}

async function queueCompleteOutfit(sessionId: string, input: OutfitInput) {
  const data = await storage.read(sessionId);
  if (!input.screenshotId || (input.screenshotId !== 'sample' && data.images[input.screenshotId]?.kind !== 'screenshot')) throw new AppError('Screenshot reference not found in this session. Upload or select a screenshot first.', 404);
  if (input.faceId && data.images[input.faceId]?.kind !== 'face') throw new AppError('Face reference not found in this session.', 404);
  if (input.personId !== 'studio' && data.images[input.personId]?.kind !== 'person') throw new AppError('Person reference not found in this session.', 404);
  const visible = input.garments.filter(g => g.visible);
  if (!visible.length || new Set(input.garments.map(g => g.id)).size !== input.garments.length) throw new AppError('Choose at least one visible garment with unique IDs.');
  const products = input.productIds.map(id => data.products[id]);
  if (products.some(p => !p)) throw new AppError('One selected product expired. Search for that piece again.');
  const map = new Map(products.map(p => [p.garmentId, p]));
  if (map.size !== products.length || new Set(input.productIds).size !== products.length) throw new AppError('Choose one product per visible garment.');
  if (products.some(p => !visible.some(g => g.id === p.garmentId))) throw new AppError('A selected listing no longer belongs to a visible garment.');
  const missing = visible.filter(g => !map.has(g.id));
  if (missing.length) throw new AppError(`Select a real product for: ${missing.map(g => g.name).join(', ')}.`);
  if (products.some(p => p.isDemo)) throw new AppError('Complete outfit rendering requires real product listings. Search with live shopping before rendering.', 422);
  if (input.retryGarmentId && !visible.some(g => g.id === input.retryGarmentId)) throw new AppError('Only a selected visible garment can be retried.');
  const pieces = visible.map(garment => ({ garment, product: map.get(garment.id)! }));
  const screenshotId = input.screenshotId;
  const outfitKey = outfitSignature(input.personId, Object.fromEntries(products.map(p => [p.garmentId, p.id])), input.garments, { screenshotId, faceId: input.faceId });
  const key = digest(['outfit-v2', outfitKey, input.garments, input.personId === 'studio' ? 'studio-v1' : data.images[input.personId].hash, screenshotId === 'sample' ? 'sample-v1' : data.images[screenshotId].hash, input.faceId && data.images[input.faceId].hash, pieces.map(p => p.product), OUTFIT_SETTINGS, process.env.VISION_MODEL, process.env.VISION_BASE_URL, process.env.VISION_PROVIDER]);
  return schedule(sessionId, key, input.force || !!input.retryGarmentId, async (progress, deadline) => {
    const provider = new OpenAIOutfit();
    const { references, saved } = await frozenProductReferences(sessionId, pieces, progress);
    const [person, screenshot, face] = await Promise.all([storage.getImage(sessionId, input.personId), storage.getImage(sessionId, screenshotId), input.faceId ? storage.getImage(sessionId, input.faceId) : Promise.resolve(undefined)]);
    const planKey = digest(['layering-v2', (await normalizeImage(screenshot)).hash, references.map(r => [r.garment, r.product, r.hash]), input.garments, process.env.VISION_MODEL, process.env.VISION_BASE_URL, process.env.VISION_PROVIDER]);
    const fresh = await storage.read(sessionId), cachedPlan = fresh.layeringPlans?.[planKey];
    await progress('Analyzing original outfit layering');
    const analyzed = cachedPlan ? { plan: validateLayeringPlan(cachedPlan, references), latencyMs: 0, usage: undefined } : await provider.analyze(screenshot, references, deadline, input.garments);
    if (!cachedPlan) await storage.update(sessionId, d => { (d.layeringPlans ||= {})[planKey] = analyzed.plan; });
    const referenceKey = digest(['outfit-v2', (await normalizeImage(person)).hash, face && (await normalizeImage(face)).hash, planKey, analyzed.plan, references.map(r => [r.garment.id, r.product.id, r.hash]), OUTFIT_SETTINGS]);
    const previous = input.retryGarmentId ? Object.values(fresh.renders).filter(r => r.outfit && r.outfitKey === outfitKey && r.baseRenderId === r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : undefined;
    const accepted = await renderReviewedOutfit(provider, { person, face, references, plan: analyzed.plan, previous: previous ? await readRenderImage(sessionId, previous) : undefined, retryGarmentId: input.retryGarmentId, deadline }, progress);
    await progress('Saving accepted outfit preview');
    const ref = await storage.putImage(sessionId, accepted.image, 'render'), id = randomUUID();
    return { id, baseRenderId: id, createdAt: new Date().toISOString(), pose: input.personId === 'studio' ? 'runway' : 'original', provider: 'openai_outfit', outfitKey, personId: input.personId, productIds: pieces.map(p => p.product.id), image: ref.url, isDemo: false,
      note: 'Complete outfit passed AI checks for every selected product, layering and identity. Details can still vary; this is a style visualization, not measured physical fit.',
      outfit: { version: 'outfit-v2', screenshotId, faceId: input.faceId, references: saved, layeringPlan: analyzed.plan, reviews: accepted.reviews, settings: OUTFIT_SETTINGS, referenceKey, usage: [{ stage: cachedPlan ? 'layering-cache' : 'layering', latencyMs: analyzed.latencyMs, usage: analyzed.usage }, ...accepted.usage] }
    };
  });
}

async function queueCompletePose(sessionId: string, source: RenderResult, pose: PoseId, faceId?: string) {
  const data = await storage.read(sessionId), details = source.outfit;
  if (!details) throw new AppError('This historical render has no complete product references. Render the outfit once with OpenAI before changing its photo pose. Your preview is preserved.', 422);
  const effectiveFaceId = faceId || details.faceId;
  if (effectiveFaceId && data.images[effectiveFaceId]?.kind !== 'face') throw new AppError('Face reference not found in this session.', 404);
  const key = digest(['pose-outfit-v2', source.id, details.referenceKey, details.layeringPlan, pose, effectiveFaceId && data.images[effectiveFaceId].hash, OUTFIT_SETTINGS, process.env.VISION_MODEL, process.env.VISION_BASE_URL, process.env.VISION_PROVIDER]);
  return schedule(sessionId, key, false, async (progress, deadline) => {
    const references = await Promise.all(details.references.map(async r => {
      const ref = data.images[r.imageId];
      if (ref?.kind !== 'product' || ref.hash !== r.hash) throw new AppError('A frozen product reference is missing. Render the complete outfit again.', 404);
      return { garment: r.garment, product: r.product, image: await storage.getImage(sessionId, r.imageId), hash: r.hash };
    }));
    const plan = validateLayeringPlan(details.layeringPlan, references);
    const [person, face, previous, poseReference] = await Promise.all([storage.getImage(sessionId, source.personId), effectiveFaceId ? storage.getImage(sessionId, effectiveFaceId) : Promise.resolve(undefined), readRenderImage(sessionId, source), sampleAsset(`/avatar/pose-guides/${pose}.png`)]);
    const accepted = await renderReviewedOutfit(new OpenAIOutfit(), { person, face, previous, references, plan, poseReference, posePrompt: POSES.find(p => p.id === pose)!.prompt, deadline }, progress);
    await progress('Saving accepted photo pose');
    const ref = await storage.putImage(sessionId, accepted.image, 'render');
    const selected = Object.fromEntries(details.references.map(r => [r.garment.id, r.product.id]));
    const outfitKey = outfitSignature(source.personId, selected, details.references.map(r => r.garment), { screenshotId: details.screenshotId, faceId: effectiveFaceId });
    return { ...source, id: randomUUID(), pose, image: ref.url, outfitKey, provider: 'openai_outfit', createdAt: new Date().toISOString(), outfit: { ...details, faceId: effectiveFaceId, reviews: accepted.reviews, referenceKey: digest([details.referenceKey, key]), usage: accepted.usage } };
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
  const data = await storage.read(sessionId);
  const fixtureProducts = input.productIds.map(id => data.products[id]);
  if (input.screenshotId === EXAMPLE_SOURCE_ID) {
    if (input.personId !== 'studio') throw new AppError('The fitEXAMPLE fixture uses the studio model only. Choose Studio before rendering.', 422);
    if (input.faceId) throw new AppError('The fitEXAMPLE fixture has a fixed studio identity. Remove the face override to use its pre-rendered poses.', 422);
    if (input.retryGarmentId) throw new AppError('The fitEXAMPLE fixture has one approved four-piece outfit and cannot retry an individual garment.', 422);
    if (fixtureProducts.some(p => !p) || !isSupportedExampleOutfit(input.garments, fixtureProducts as ProductListing[])) throw new AppError('The fitEXAMPLE preview requires the complete, unedited four-piece outfit and its canonical listings. Re-analyze the example and select all four products.', 422);
    const selection = Object.fromEntries(EXAMPLE_PRODUCTS.map(p => [p.garmentId, p.id]));
    const outfitKey = outfitSignature('studio', selection, EXAMPLE_GARMENTS, { screenshotId: EXAMPLE_SOURCE_ID });
    const key = digest(['fitexample-v1', 'render-v1', outfitKey, EXAMPLE_SOURCE_ID, EXAMPLE_PRODUCTS.map(p => p.id)]);
    return schedule(sessionId, key, input.force, async progress => {
      await progress('Preparing the fitEXAMPLE outfit');
      const resultId = randomUUID();
      return { id: resultId, baseRenderId: resultId, createdAt: new Date().toISOString(), pose: 'runway' as const, provider: 'fitEXAMPLE fixture', outfitKey, personId: 'studio', productIds: EXAMPLE_PRODUCTS.map(p => p.id), image: exampleRender('runway'), isDemo: true, exampleId: EXAMPLE_ID,
        note: 'Pre-rendered fitEXAMPLE studio fixture using the complete approved four-piece outfit. This is a fixed visual example, not a live try-on.' };
    });
  }
  const status = providerStatus().tryon;
  if (status.mode === 'unavailable') throw new AppError('Try-on provider credentials are incomplete. Check your environment settings.', 503);
  if (status.name === 'openai_outfit' && status.mode === 'live') return queueCompleteOutfit(sessionId, input);
  if (status.name === 'fashn_local') { const readiness = (await providerReadiness()).tryon; if (!readiness.ready) throw new AppError(readiness.detail, 503); }
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
export async function queuePose(sessionId: string, renderId: string, pose: PoseId, faceId?: string) {
  const data = await storage.read(sessionId), source = data.renders[renderId];
  if (!source) throw new AppError('Render not found in this session.', 404);
  if (source.exampleId === EXAMPLE_ID) {
    if (faceId) throw new AppError('The fitEXAMPLE fixture has a fixed studio identity and does not accept a face override.', 422);
    const key = digest(['fitexample-v1', 'pose-v1', source.outfitKey, source.id, pose, EXAMPLE_SOURCE_ID]);
    return schedule(sessionId, key, false, async progress => {
      await progress(`Creating ${POSES.find(p => p.id === pose)?.name.toLowerCase()}`);
      return { ...source, id: randomUUID(), pose, image: exampleRender(pose), createdAt: new Date().toISOString() };
    });
  }
  const status = providerStatus().pose;
  if (source.outfit && status.name !== 'openai_outfit') throw new AppError('Complete outfit photo poses require POSE_PROVIDER=openai_outfit so every edit receives product and quality checks. Your accepted preview is preserved.', 503);
  if (!source.isDemo && status.mode !== 'live') throw new AppError('Pose editing is not configured. Your try-on remains available in the photo’s original pose.', 503);
  if (!source.isDemo && status.name === 'flux_local') { const readiness = (await providerReadiness()).pose; if (!readiness.ready) throw new AppError(readiness.detail, 503); }
  if (faceId && data.images[faceId]?.kind !== 'face') throw new AppError('Face reference not found in this session.', 404);
  if (!source.isDemo && status.name === 'openai_outfit') return queueCompletePose(sessionId, source, pose, faceId);
  const key = digest([source.outfitKey, source.id, pose, faceId && data.images[faceId].hash, source.isDemo ? 'demo-v1' : status.name, process.env.POSE_MODEL || 'fal-ai/flux-2/klein/9b/edit', status.name === 'flux_local' ? 'neutral-guide-face-v2' : 'photo-guide-v1']);
  return schedule(sessionId, key, false, async progress => {
    await progress(`Creating ${POSES.find(p => p.id === pose)?.name.toLowerCase()}`);
    if (source.isDemo) return { ...source, id: randomUUID(), pose, image: demoRender(pose, source.image.includes('burgundy') ? 'burgundy' : 'silver'), createdAt: new Date().toISOString() };
    const provider = status.name === 'flux_local' ? new FluxLocalPose() : new FalPose();
    let identityReference = await storage.getImage(sessionId, faceId || source.personId);
    if (status.name === 'flux_local' && !faceId) {
      const saved = z.object({ avatar: avatarProfileSchema.optional() }).safeParse(data.state);
      const avatar = saved.success ? saved.data.avatar : undefined;
      const bounds = avatar?.referenceId === source.personId && !avatar.faceReferenceId && avatar.sourceHash === (source.personId === 'studio' ? 'studio' : data.images[source.personId]?.hash) ? avatar.faceBounds : undefined;
      identityReference = await poseIdentity(identityReference, bounds);
    }
    const output = await provider.render({ wardrobeImage: await readRenderImage(sessionId, source), identityReference, posePresetReference: await sampleAsset(status.name === 'flux_local' ? `/avatar/pose-guides/${pose}.png` : `/demo/base-${pose}.webp`), posePrompt: POSES.find(p => p.id === pose)!.prompt, pose });
    const ref = await storage.putImage(sessionId, output, 'render');
    return { ...source, id: randomUUID(), pose, image: ref.url, provider: `${status.name === 'flux_local' ? 'Private GPU' : 'fal'} / ${process.env.POSE_MODEL || 'FLUX.2 klein'}`, createdAt: new Date().toISOString(), note: 'AI pose preview. Likeness, clothing details and body proportions may change. This is not a sizing simulation.' };
  });
}
