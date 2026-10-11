import { z } from 'zod';
const ratio = z.number().finite().min(.65).max(1.35);
const referenceId = z.union([z.literal('studio'), z.string().uuid()]);
export const avatarProfileSchema = z.object({
  referenceId, sourceHash: z.string().min(1).max(128), faceReferenceId: referenceId.optional(),
  proportions: z.object({ shoulder: ratio, waist: ratio, hips: ratio, torso: ratio, legs: ratio }).strict(),
  faceLandmarks: z.array(z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1), z: z.number().finite().min(-2).max(2) }).strict()).refine(v => v.length === 468 || v.length === 478).optional(),
  faceBounds: z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1), w: z.number().finite().positive().max(1), h: z.number().finite().positive().max(1) }).strict().refine(b => b.x + b.w <= 1.00001 && b.y + b.h <= 1.00001).optional(),
  skinColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
}).strict();
export type AvatarProfile = z.infer<typeof avatarProfileSchema>;
export const studioProfile = (): AvatarProfile => ({ referenceId: 'studio', sourceHash: 'studio', proportions: { shoulder: 1, waist: 1, hips: 1, torso: 1, legs: 1 } });
