// Explicitly invoked paid evaluation only; excluded from the normal unit suite.
import { it, expect } from 'vitest';
import { loadEnvConfig } from '@next/env';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { garmentSchema, type ProductListing } from '@/lib/schema';
import { OpenAIOutfit, OutfitReviewFailure, OUTFIT_SETTINGS, OUTFIT_JOB_BUDGET_MS, renderReviewedOutfit, type ProductReference } from '@/lib/providers/openai-outfit';
import { fetchImage } from '@/lib/security';
import { normalizeImage } from '@/lib/images';
import { compositionOrder } from '@/lib/outfit';
import { FashnHosted, FashnLocal } from '@/lib/providers/tryon';

it('compares the complete outfit and legacy renderer on identical frozen real products', async () => {
  if (process.env.RUN_OUTFIT_EVAL !== 'true') throw new Error('Set RUN_OUTFIT_EVAL=true to explicitly authorize this paid evaluation.');
  // Next skips .env.local under NODE_ENV=test; this explicitly invoked live tool needs runtime settings.
  const priorEnvironment = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'development' });
  try { loadEnvConfig(process.cwd(), true); }
  finally { Object.assign(process.env, { NODE_ENV: priorEnvironment }); }
  const directory = process.env.OUTFIT_EVAL_DIR || 'docs/outfit-evaluation/sample';
  const baselineOnly = process.env.OUTFIT_EVAL_BASELINE_ONLY === 'true';
  const prior = await readFile(join(directory, 'results.json'), 'utf8').catch(() => null);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as { garments: unknown[]; products: ProductListing[]; screenshot: string; person: string; baselineProvider: string };
  const garments = z.array(garmentSchema).min(1).max(16).parse(manifest.garments);
  const refs: ProductReference[] = [];
  const report: Record<string, unknown> = baselineOnly && prior ? JSON.parse(prior) : { startedAt: new Date().toISOString(), settings: OUTFIT_SETTINGS, source: directory, status: 'running', superiorityClaim: false, stages: [], baseline: { provider: manifest.baselineProvider, status: 'not-run' } };
  await mkdir(join(directory, 'products'), { recursive: true });
  const save = async () => writeFile(join(directory, 'results.json'), JSON.stringify(report, null, 2));
  if (prior) await writeFile(join(directory, `previous-${Date.now()}.json`), prior);
  await save();
  let stage = 'product-downloads', start = Date.now();
  try {
    for (const garment of garments.filter(g => g.visible)) {
      const product = manifest.products.find(p => p.garmentId === garment.id);
      if (!product || product.isDemo) throw new Error(`No frozen real product for ${garment.name}`);
      const path = join(directory, 'products', `${refs.length + 1}.webp`);
      const input = await readFile(path).catch(async () => {
        const normalized = await normalizeImage(await fetchImage(product.imageUrl));
        await writeFile(path, normalized.data); return normalized.data;
      });
      const normalized = await normalizeImage(input);
      refs.push({ garment, product, image: normalized.data, hash: normalized.hash });
    }
    report.references = refs.map(r => ({ garmentId: r.garment.id, productId: r.product.id, hash: r.hash }));
    const person = await readFile(manifest.person), screenshot = (await normalizeImage(await readFile(manifest.screenshot))).data;
    const legacyComparison = async () => {
      const baselineStarted = Date.now();
      try {
        const baseline = manifest.baselineProvider === 'fashn_local' ? new FashnLocal() : new FashnHosted();
        let image: Buffer = person;
        for (const g of compositionOrder(garments)) {
          const r = refs.find(r => r.garment.id === g.id)!;
          image = await baseline.render({ personImage: image, garmentImage: r.image, category: g.category === 'dress' ? 'one-pieces' : g.category === 'bottom' ? 'bottoms' : 'tops', seed: 42 });
        }
        await writeFile(join(directory, 'legacy.webp'), (await normalizeImage(image)).data);
        report.baseline = { provider: manifest.baselineProvider, status: 'completed', latencyMs: Date.now() - baselineStarted, appliedGarmentIds: compositionOrder(garments).map(g => g.id), usage: 'Legacy provider does not expose token usage.' };
      } catch (e) { report.baseline = { provider: manifest.baselineProvider, status: 'failed', latencyMs: Date.now() - baselineStarted, error: e instanceof Error ? e.message : 'Baseline failed' }; }
      await save();
    };
    if (baselineOnly) {
      await legacyComparison();
      expect(report.baseline).toMatchObject({ status: 'completed' });
      return;
    }
    const provider = new OpenAIOutfit(), deadline = Date.now() + OUTFIT_JOB_BUDGET_MS;
    const edit = provider.edit.bind(provider);
    let candidateNumber = 0;
    // Evaluation artifacts stay separate from application publication, including rejected candidates.
    provider.edit = async input => {
      const result = await edit(input);
      const path = `candidate-${String(report.startedAt).replace(/[^0-9]/g, '')}-${++candidateNumber}.webp`;
      await writeFile(join(directory, path), result.image);
      report.candidates = [...(report.candidates as unknown[] || []), { path, latencyMs: result.latencyMs, usage: result.usage, accepted: false }];
      await save();
      return result;
    };
    stage = 'layering'; start = Date.now();
    const analysis = await provider.analyze(screenshot, refs, deadline, garments);
    report.layering = analysis;
    await save(); stage = 'image-generation-and-review'; start = Date.now();
    const accepted = await renderReviewedOutfit(provider, { person, references: refs, plan: analysis.plan, deadline }, async message => {
      (report.stages as unknown[]).push({ progress: message, time: new Date().toISOString() }); await save();
    });
    await writeFile(join(directory, 'sunburst.webp'), accepted.image);
    report.sunburst = { reviews: accepted.reviews, usage: accepted.usage }; report.status = 'accepted'; await save();
    (report.candidates as { accepted: boolean }[]).at(-1)!.accepted = true;
    if (process.env.RUN_OUTFIT_BASELINE === 'true') {
      stage = 'legacy-baseline'; start = Date.now();
      await legacyComparison();
    }
    report.manualInspection = 'Pending: compare layering, each product, identity, hands, bag and jewelry contact. Automated acceptance is not a superiority claim.';
    await save(); expect(accepted.reviews.at(-1)?.passed).toBe(true);
  } catch (e) {
    if (baselineOnly) { await save(); throw e; }
    if (e instanceof OutfitReviewFailure) report.sunburst = { reviews: e.reviews, usage: e.usage };
    report.status = 'failed'; report.failure = { stage, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : 'Evaluation failed', diagnostics: e instanceof Error ? e.cause : undefined }; await save(); throw e;
  }
});
