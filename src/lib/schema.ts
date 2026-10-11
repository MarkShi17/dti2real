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
  bbox: boxSchema.optional(), confidence: z.number().min(0).max(1), searchQueries: z.array(z.string().trim().min(1).max(250)).max(4), visible: z.boolean()
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
  visualVerified?: boolean; retrievalProvider?: string; availability?: 'available' | 'sold' | 'unknown';
};
export type ProviderMode = 'live' | 'demo' | 'unavailable';
export type ProviderInfo = { name: string; mode: ProviderMode; detail: string };
export type ProviderStatus = { vision: ProviderInfo; shopping: ProviderInfo; tryon: ProviderInfo; pose: ProviderInfo };
export type ImageRef = { id: string; url: string; width: number; height: number; hash: string; kind: 'screenshot' | 'person' | 'render'; isSample?: boolean };
export type RenderResult = { image: string; pose: PoseId | 'original'; baseRenderId: string; provider: string; isDemo: boolean; note: string; outfitKey: string; createdAt: string; id: string; personId: string; productIds: string[] };
export type Job = { id: string; status: 'queued' | 'running' | 'completed' | 'failed'; progress: string; result?: RenderResult; error?: string; createdAt: number; key: string };
export const imageIdSchema = z.string().regex(/^(sample|studio|[a-f0-9-]{36})$/);
export const outfitInputSchema = z.object({ personId: imageIdSchema.default('studio'), garments: z.array(garmentSchema).max(16), productIds: z.array(z.string().min(1).max(160)).max(16), force: z.boolean().default(false), retryGarmentId: z.string().min(1).max(80).optional() });
export const poseInputSchema = z.object({ renderId: z.string().uuid(), pose: z.enum(poseIds) });
export type OutfitInput = z.infer<typeof outfitInputSchema>;
