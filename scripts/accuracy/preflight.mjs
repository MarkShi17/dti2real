import { mkdir, writeFile } from 'node:fs/promises';
import { evaluationEnv } from './env.mjs';
const env = evaluationEnv(process.argv[2] || '.env.accuracy');
for (const key of ['VISION_API_KEY', 'SERPER_API_KEY', 'APIFY_TOKEN']) if (!env[key]) throw new Error('Missing ' + key + '. Fill the ignored repo-root .env.');
const get = async (url, key) => {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!r.ok) throw new Error(new URL(url).hostname + ': HTTP ' + r.status);
  return r.json();
};
const report = { checkedAt: new Date().toISOString(), model: null, actors: {}, failures: [] };
try {
  const models = await get(env.VISION_BASE_URL + '/models?type=text&vision=true', env.VISION_API_KEY);
  report.model = (models.data || []).find(m => m.id === env.VISION_MODEL) || null;
  console.log(JSON.stringify({ service: 'vision', selectedModel: report.model?.id, pricing: report.model?.pricing ? { inputPerMillion:report.model.pricing.input_per_million, outputPerMillion:report.model.pricing.output_per_million } : null }));
} catch (e) { report.failures.push('vision: ' + e.message); console.log(report.failures.at(-1)); }
for (const actor of ['lukass/depop-scraper', 'lulzasaur/grailed-scraper', 'dtrungtin/ebay-items-scraper', 'crawlerbros/facebook-marketplace-scraper']) {
  try {
    const { data } = await get('https://api.apify.com/v2/acts/' + actor.replace('/', '~'), env.APIFY_TOKEN);
    const metadata = { id: data.id, name: data.name, username: data.username, pricingInfos: data.pricingInfos, defaultRunOptions: data.defaultRunOptions, taggedBuilds: data.taggedBuilds, isDeprecated: data.isDeprecated };
    report.actors[actor] = metadata;
    console.log(JSON.stringify({ actor, id:data.id, build:data.taggedBuilds?.latest?.buildNumber, pricingModel:data.pricingInfos?.at(-1)?.pricingModel }));
  } catch (e) { report.failures.push(actor + ': ' + e.message); console.log(report.failures.at(-1)); }
}
await mkdir('.accuracy', { recursive: true });
await writeFile('.accuracy/preflight.json', JSON.stringify(report, null, 2), { mode: 0o600 });
if (!report.model) process.exitCode = 1;
