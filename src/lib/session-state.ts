import { z } from 'zod';
import { avatarProfileSchema } from './avatar/profile';
import { garmentSchema, imageIdSchema, poseIds } from './schema';
import type { SessionData } from './storage';
import { AppError } from './security';

export const sessionStateSchema = z.object({
  screenshotId: imageIdSchema.nullable(), personId: imageIdSchema,
  garments: z.array(garmentSchema).max(16), selected: z.record(z.string().max(80), z.string().max(160)),
  activeId: z.string().max(80).nullable(), renderId: z.string().uuid().nullable(),
  faceId: z.string().uuid().nullable().optional(), avatar: avatarProfileSchema.nullable().optional(),
  view: z.enum(['photo', '3d']).default('photo'), avatarPose: z.enum(poseIds).default('runway'),
});
export type SavedState = z.infer<typeof sessionStateSchema>;

export function validateAvatarReferences(state: SavedState, data: SessionData) {
  if (state.personId !== 'studio' && data.images[state.personId]?.kind !== 'person') throw new AppError('Person reference is not in this session.', 404);
  if (state.faceId && data.images[state.faceId]?.kind !== 'face') throw new AppError('Face reference is not in this session.', 404);
  if (!state.avatar) return;
  const hash = state.personId === 'studio' ? 'studio' : data.images[state.personId]?.hash;
  if (state.avatar.referenceId !== state.personId || state.avatar.sourceHash !== hash || state.avatar.faceReferenceId !== (state.faceId || undefined)) throw new AppError('Avatar reference changed. Rebuild the avatar for your current photo.');
}
