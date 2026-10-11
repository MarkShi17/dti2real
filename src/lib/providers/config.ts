import type { ProviderInfo, ProviderStatus } from '../schema';
import { segmentationStatus } from './segmentation';
function info(name: string, configured: boolean, detail: string): ProviderInfo { return { name, mode: configured ? 'live' : 'unavailable', detail }; }
export function providerStatus(): ProviderStatus {
  const forced = process.env.DEMO_MODE === 'true';
  const vision = process.env.VISION_PROVIDER || (process.env.VISION_API_KEY ? 'openai_compatible' : 'demo');
  const tryon = process.env.TRYON_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai_outfit' : process.env.FASHN_API_KEY ? 'fashn_api' : process.env.FASHN_LOCAL_URL ? 'fashn_local' : 'demo');
  const pose = process.env.POSE_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai_outfit' : process.env.POSE_API_KEY ? 'fal' : process.env.POSE_LOCAL_URL ? 'flux_local' : 'demo');
  const outfitConfigured = !!process.env.OPENAI_API_KEY && !!process.env.VISION_API_KEY && !!process.env.VISION_MODEL && ['openai_compatible', 'openrouter'].includes(vision);
  const outfitDetail = 'Your person/face and selected product photos are sent directly to OpenAI for complete outfit edits. GPT-5.4 uses the separately configured vision provider for layering and quality review.';
  const demo = (detail: string): ProviderInfo => ({ name: 'Demo', mode: 'demo', detail });
  return {
    segmentation: segmentationStatus(),
    vision: forced || vision === 'demo' ? demo('Bundled sample annotations. Other uploads need manual labels or a vision key.') : info(vision, ['openai_compatible', 'openrouter'].includes(vision) && !!process.env.VISION_API_KEY && !!process.env.VISION_MODEL, 'Vision API analyzes your screenshot only when you choose Analyze.'),
    shopping: forced || (!process.env.SERPAPI_KEY && !process.env.EBAY_CLIENT_ID && !process.env.EBAY_CLIENT_SECRET) ? demo('Illustrative listings and prices, with external search links.') : info('SerpApi / eBay', !!process.env.SERPAPI_KEY || (!!process.env.EBAY_CLIENT_ID && !!process.env.EBAY_CLIENT_SECRET), 'US search results. Prices and availability may change.'),
    tryon: forced || tryon === 'demo' ? demo('Pre-rendered silver/burgundy sample outfits on the fictional studio model only.') : info(tryon, tryon === 'openai_outfit' ? outfitConfigured : tryon === 'fashn_local' ? !!process.env.FASHN_LOCAL_URL && !!process.env.FASHN_LOCAL_TOKEN : tryon === 'fashn_api' && !!process.env.FASHN_API_KEY, tryon === 'openai_outfit' ? outfitDetail : tryon === 'fashn_local' ? 'Your selected photo is sent to your private GPU worker when you render.' : 'Your selected photo and garment images are sent to FASHN when you render.'),
    pose: forced || pose === 'demo' ? demo('Five sample poses. Uploaded photos retain their original pose without a live editor.') : info(pose, pose === 'openai_outfit' ? outfitConfigured : pose === 'flux_local' ? !!process.env.POSE_LOCAL_URL && !!process.env.POSE_LOCAL_TOKEN : pose === 'fal' && !!process.env.POSE_API_KEY, pose === 'openai_outfit' ? outfitDetail : pose === 'flux_local' ? 'Your outfit and identity references are sent to your private GPU for a pose edit.' : 'Your wardrobe and identity photos are sent to fal for a best-effort AI pose edit.')
  };
}
