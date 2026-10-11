import { describe, expect, it } from 'vitest';
import { sessionStateSchema, validateAvatarReferences } from '../../src/lib/session-state';
import type { SessionData } from '../../src/lib/storage';

const personId = '7aabc534-3dcf-4789-a168-99c15def9749';
const faceId = '9cabc534-3dcf-4789-a168-99c15def9749';
const base = { screenshotId: null, personId, garments: [], selected: {}, activeId: null, renderId: null };
const avatar = { referenceId: personId, sourceHash: 'hash', proportions: { shoulder: 1, waist: 1, hips: 1, torso: 1, legs: 1 } };
const data: SessionData = { createdAt: Date.now(), products: {}, jobs: {}, renders: {}, cache: {}, images: { [personId]: { id: personId, hash: 'hash', kind: 'person', url: '/private', width: 100, height: 100 }, [faceId]: { id: faceId, hash: 'face', kind: 'face', url: '/private', width: 100, height: 100 } } };
describe('private avatar persistence', () => {
  it('restores older sessions with default view and pose', () => { expect(sessionStateSchema.parse(base)).toMatchObject({ view: 'photo', avatarPose: 'runway' }); });
  it('accepts current photo geometry and optional same-session face', () => { expect(() => validateAvatarReferences(sessionStateSchema.parse({ ...base, faceId, avatar: { ...avatar, faceReferenceId: faceId } }), data)).not.toThrow(); });
  it('rejects geometry from a different photo or face', () => { expect(() => validateAvatarReferences(sessionStateSchema.parse({ ...base, avatar: { ...avatar, sourceHash: 'old' } }), data)).toThrow('reference changed'); expect(() => validateAvatarReferences(sessionStateSchema.parse({ ...base, faceId, avatar }), data)).toThrow('reference changed'); });
  it('bounds body controls and forbids persisted external URLs', () => { expect(sessionStateSchema.safeParse({ ...base, avatar: { ...avatar, personUrl: 'https://external.example/photo' } }).success).toBe(false); expect(sessionStateSchema.safeParse({ ...base, avatar: { ...avatar, proportions: { ...avatar.proportions, waist: 10 } } }).success).toBe(false); });
});
