import { z } from 'zod';
export const categories = ['top', 'bottom', 'dress', 'outerwear', 'hosiery', 'shoes', 'bag', 'headwear', 'jewelry', 'other'] as const;
export const poseIds = ['runway', 'hip', 'peace', 'shoulder', 'lean'] as const;
export type PoseId = typeof poseIds[number];
export type GarmentCategory = typeof categories[number];
export type Box = { x: number; y: number; w: number; h: number };
export function clampBox(b: Box): Box {
  const x = Math.max(0, Math.min(.99, b.x)), y = Math.max(0, Math.min(.99, b.y));
  return { x, y, w: Math.max(.01, Math.min(1 - x, b.w)), h: Math.max(.01, Math.min(1 - y, b.h)) };
}
export const boxSchema = z.object({ x: z.number().finite(), y: z.number().finite(), w: z.number().finite(), h: z.number().finite() }).transform(clampBox);
export const garmentSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().trim().min(1).max(100), category: z.enum(categories),
  attributes: z.object({ color: z.array(z.string().max(40)).max(8), material: z.string().max(100).optional(), silhouette: z.string().max(100).optional(), pattern: z.string().max(100).optional(), aesthetic: z.array(z.string().max(60)).max(8).optional(), details: z.array(z.string().max(100)).max(10).optional() }),
  bbox: boxSchema.optional(), confidence: z.number().min(0).max(1), searchQueries: z.array(z.string().trim().min(1).max(250)).max(4), visible: z.boolean(),
  segmentation: z.object({ imageId: z.string().uuid(), sourceImageId: z.string().uuid(), score: z.number().min(0).max(1), model: z.string().max(120) }).optional()
});
export type Garment = z.infer<typeof garmentSchema>;
export const filtersSchema = z.object({ priceMax: z.number().positive().max(100000).optional(), marketplaces: z.array(z.string().max(80)).max(20).default([]), secondhandOnly: z.boolean().default(false), sortBy: z.enum(['best_match', 'price_low', 'price_high']).default('best_match') });
export type Filters = z.infer<typeof filtersSchema>;
export const defaultFilters: Filters = { marketplaces: [], secondhandOnly: false, sortBy: 'best_match' };
export type ProductListing = {
  id: string; garmentId: string; source: string; title: string; productUrl: string; imageUrl: string;
  price?: number; currency?: string; condition: 'new' | 'used' | 'unknown'; thrift: boolean;
  retrievedAt?: string; matchScore?: number; matchReason?: string; isDemo: boolean;
  variant?: 'silver' | 'burgundy'; category?: GarmentCategory;
};
export type ProviderMode = 'live' | 'demo' | 'unavailable';
export type ProviderInfo = { name: string; mode: ProviderMode; detail: string; ready?: boolean; expiresAt?: string };
export type ProviderStatus = { vision: ProviderInfo; shopping: ProviderInfo; tryon: ProviderInfo; pose: ProviderInfo; segmentation?: ProviderInfo };
export type ImageRef = { id: string; url: string; width: number; height: number; hash: string; kind: 'screenshot' | 'person' | 'face' | 'render' | 'segment' | 'product'; isSample?: boolean; sourceImageId?: string };
const description = z.string().trim().min(1).max(1500);
export const layeringPlanSchema = z.object({
  pieces: z.array(z.object({ garmentId: z.string().min(1).max(80), productId: z.string().min(1).max(160), placement: description, over: z.array(z.string().max(80)).max(16), under: z.array(z.string().max(80)).max(16), visibleEdges: description, tucking: description, closure: description, accessoryPosition: description })).min(1).max(16),
  unmapped: z.array(z.object({ sourceId: z.string().max(80), description })).max(16),
  instructions: description,
});
export const qualityReviewSchema = z.object({
  passed: z.boolean(),
  products: z.array(z.object({ garmentId: z.string().min(1).max(80), productId: z.string().min(1).max(160), appearance: z.boolean(), placement: z.boolean(), issues: z.array(description).max(10) })).min(1).max(16),
  checks: z.object({ layering: z.boolean(), identity: z.boolean(), anatomy: z.boolean(), accessories: z.boolean(), fabrics: z.boolean(), clipping: z.boolean(), pose: z.boolean() }),
  issues: z.array(description).max(20), repairInstructions: z.string().max(8000),
});
export type LayeringPlan = z.infer<typeof layeringPlanSchema>;
export type QualityReview = z.infer<typeof qualityReviewSchema>;
export type OutfitProductReference = { garment: Garment; product: ProductListing; imageId: string; hash: string };
export type OutfitRenderDetails = { version: 'outfit-v2'; screenshotId: string; faceId?: string; references: OutfitProductReference[]; layeringPlan: LayeringPlan; reviews: QualityReview[]; settings: { model: string; quality: 'max'; size: '1024x1536'; n: 1 }; referenceKey: string; usage: { stage: string; latencyMs: number; usage?: unknown }[] };
export type RenderResult = { image: string; pose: PoseId | 'original'; baseRenderId: string; provider: string; isDemo: boolean; note: string; outfitKey: string; createdAt: string; id: string; personId: string; productIds: string[]; outfit?: OutfitRenderDetails };
export type Job = { id: string; status: 'queued' | 'running' | 'completed' | 'failed'; progress: string; result?: RenderResult; error?: string; createdAt: number; key: string };
export const imageIdSchema = z.string().regex(/^(sample|studio|[a-f0-9-]{36})$/);
export const outfitInputSchema = z.object({ personId: imageIdSchema.default('studio'), screenshotId: imageIdSchema.optional(), faceId: z.string().uuid().optional(), garments: z.array(garmentSchema).max(16).refine(gs => new Set(gs.map(g => g.id)).size === gs.length, 'Garment IDs must be unique.'), productIds: z.array(z.string().min(1).max(160)).max(16).refine(ids => new Set(ids).size === ids.length, 'Product IDs must be unique.'), force: z.boolean().default(false), retryGarmentId: z.string().min(1).max(80).optional() });
export const poseInputSchema = z.object({ renderId: z.string().uuid(), pose: z.enum(poseIds), faceId: z.string().uuid().optional() });
export type OutfitInput = z.infer<typeof outfitInputSchema>;
