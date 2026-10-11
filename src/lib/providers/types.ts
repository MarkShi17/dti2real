import type { Filters, Garment, PoseId, ProductListing } from '../schema';
export interface VisionProvider { analyzeOutfit(image: Buffer): Promise<Garment[]> }
export interface ShoppingProvider { searchGarment(garment: Garment, filters: Filters): Promise<ProductListing[]> }
export type TryOnInput = { personImage: Buffer; garmentImage: Buffer; category: 'tops' | 'bottoms' | 'one-pieces'; optionalPreviousImage?: Buffer; seed?: number };
export interface TryOnProvider { render(input: TryOnInput): Promise<Buffer> }
export type PoseInput = { wardrobeImage: Buffer; identityReference: Buffer; posePresetReference: Buffer; posePrompt: string; pose: PoseId };
export interface PoseProvider { render(input: PoseInput): Promise<Buffer> }
