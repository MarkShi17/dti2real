import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
export function evaluationEnv(path = '.env.accuracy') {
  let values = {};
  try { values = parseEnv(readFileSync(path, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const get = (name, fallback = '') => values['ACCURACY_' + name] || process.env['ACCURACY_' + name] || fallback;
  return {
    VISION_API_KEY: get('VISION_API_KEY'), SERPER_API_KEY: get('SERPER_API_KEY'), SERPAPI_KEY: get('SERPAPI_KEY'), APIFY_TOKEN: get('APIFY_TOKEN'), FIRECRAWL_API_KEY: get('FIRECRAWL_API_KEY'),
    VISION_PROVIDER: get('VISION_PROVIDER', 'openai_compatible'),
    VISION_BASE_URL: get('VISION_BASE_URL', 'https://api.cheaperinference.com/v1'),
    VISION_MODEL: get('VISION_MODEL', 'gpt-5.4'), ACCURACY_BUDGET_USD: get('BUDGET_USD', '30'),
    DEMO_MODE: 'false', TRYON_PROVIDER: 'demo', POSE_PROVIDER: 'demo'
  };
}
