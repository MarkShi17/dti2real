import type { ProviderInfo, ProviderStatus } from '../schema';
import { selectedShoppingSources, shoppingSourceReady } from './resale';
function info(name: string, configured: boolean, detail: string): ProviderInfo { return { name, mode: configured ? 'live' : 'unavailable', detail }; }
export function providerStatus(): ProviderStatus {
  const forced = process.env.DEMO_MODE === 'true';
  const vision = process.env.VISION_PROVIDER || (process.env.VISION_API_KEY ? 'openai_compatible' : 'demo');
  const tryon = process.env.TRYON_PROVIDER || (process.env.FASHN_API_KEY ? 'fashn_api' : process.env.FASHN_LOCAL_URL ? 'fashn_local' : 'demo');
  const pose = process.env.POSE_PROVIDER || (process.env.POSE_API_KEY ? 'fal' : 'demo');
  const demo = (detail: string): ProviderInfo => ({ name: 'Demo', mode: 'demo', detail });
  let shopping: ProviderInfo;
  try { const selected = selectedShoppingSources(); shopping = forced || !selected.length ? demo('Illustrative listings and prices, with external search links.') : info(selected.join(' / '), selected.every(shoppingSourceReady), 'Live search results. Prices and availability may change.'); }
  catch { shopping = info('Shopping', false, 'Unknown shopping source configuration.'); }
  return {
    vision: forced || vision === 'demo' ? demo('Bundled sample annotations. Other uploads need manual labels or a vision key.') : info(vision, ['openai_compatible', 'openrouter'].includes(vision) && !!process.env.VISION_API_KEY && !!process.env.VISION_MODEL, 'Vision API analyzes your screenshot and checks listing photos when you search.'),
    shopping,
    tryon: forced || tryon === 'demo' ? demo('Pre-rendered silver/burgundy sample outfits on the fictional studio model only.') : info(tryon, tryon === 'fashn_local' ? !!process.env.FASHN_LOCAL_URL : tryon === 'fashn_api' && !!process.env.FASHN_API_KEY, tryon === 'fashn_local' ? 'Your selected photo is sent to your configured private FASHN worker.' : 'Your selected photo and garment images are sent to FASHN when you render.'),
    pose: forced || pose === 'demo' ? demo('Five sample poses. Uploaded photos retain their original pose without a live editor.') : info(pose, pose === 'fal' && !!process.env.POSE_API_KEY, 'Your wardrobe and identity photos are sent to fal for a best-effort AI pose edit.')
  };
}
