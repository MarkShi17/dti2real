import type { RenderResult } from './schema';
export function queuedSearchIsCurrent(id: string, versions: Record<string, number>, snapshot: Record<string, number>) { return (versions[id] || 0) === (snapshot[id] || 0); }
export function baseRenderFor(current: RenderResult, history: RenderResult[]) { return history.find(r => r.id === current.baseRenderId) || current; }
export function createSaveQueue() {
  let tail: Promise<void> = Promise.resolve();
  return (save: () => Promise<void>) => { tail = tail.catch(() => {}).then(save); return tail; };
}
