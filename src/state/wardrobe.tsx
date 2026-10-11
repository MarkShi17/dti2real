'use client';
import { clientId } from '@/lib/client-id';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/client';
import { defaultFilters, type Filters, type Garment, type ImageRef, type Job, type PoseId, type ProductListing, type ProviderStatus, type RenderResult } from '@/lib/schema';
import { outfitSignature, requiredPieces } from '@/lib/outfit';
import { sampleImage, studioImage } from '@/lib/fixtures';
import { baseRenderFor, createSaveQueue, queuedSearchIsCurrent } from '@/lib/state-guards';
import { usePipelineProgress } from './pipeline';
import type { SavedState } from '@/lib/session-state';
import type { AvatarProfile } from '@/lib/avatar/profile';

type SessionResponse = { state?: SavedState; images: Record<string, ImageRef>; products: Record<string, ProductListing>; renders: RenderResult[]; providers: ProviderStatus };
function useWardrobeState() {
  const { pipeline, runId: progressRun, report, clear: clearProgress, beginAnalysis, beginTryon } = usePipelineProgress();
  const [ready, setReady] = useState(false), [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [screenshot, setScreenshot] = useState<ImageRef | null>(null), [person, setPerson] = useState<ImageRef | null>(null);
  const [face, setFace] = useState<ImageRef | null>(null), [avatar, setAvatar] = useState<AvatarProfile | null>(null);
  const [view, setView] = useState<'photo' | '3d'>('photo'), [avatarPose, setAvatarPose] = useState<PoseId>('runway');
  const [poseIntent, setPoseIntent] = useState(0);
  const desiredPose = useRef<PoseId | null>(null), poseVersion = useRef(0), photoVersion = useRef(0);
  const [garments, setGarments] = useState<Garment[]>([]), [activeId, setActiveId] = useState<string | null>(null);
  const [products, setProducts] = useState<Record<string, ProductListing[]>>({}), [selected, setSelected] = useState<Record<string, string>>({});
  const [inventory, setInventory] = useState<Record<string, ProductListing>>({});
  const [filters, setFilters] = useState<Filters>(defaultFilters), [render, setRender] = useState<RenderResult | null>(null), [history, setHistory] = useState<RenderResult[]>([]);
  const [busy, setBusy] = useState(''), [searching, setSearching] = useState<string[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [step, setStep] = useState(0), [pendingPose, setPendingPose] = useState<PoseId | null>(null);
  const epoch = useRef(0), searchVersions = useRef<Record<string, number>>({}), alive = useRef(true);
  const enqueueSave = useRef(createSaveQueue());
  const sampleRef: ImageRef = { id: 'sample', url: sampleImage, width: 900, height: 1200, kind: 'screenshot', hash: 'sample', isSample: true };
  const reset = useCallback(() => {
    epoch.current++; poseVersion.current++; desiredPose.current = null; clearProgress(); setScreenshot(null); setPerson(null); setFace(null); setAvatar(null); setView('photo'); setAvatarPose('runway'); setGarments([]); setProducts({}); setInventory({}); setSelected({}); setActiveId(null); setRender(null); setHistory([]); setBusy(''); setSearching([]); setNotice(''); setError(''); setStep(0); setPendingPose(null);
  }, [clearProgress]);
  useEffect(() => {
    alive.current = true;
    async function init() {
      try {
        await api('session'); const data = await api<SessionResponse>('session', undefined, 'GET');
        if (!alive.current) return; setProviders(data.providers);
        if (data.state) {
          const s = data.state; setScreenshot(s.screenshotId === 'sample' ? { id: 'sample', url: sampleImage, width: 900, height: 1200, kind: 'screenshot', hash: 'sample', isSample: true } : data.images[s.screenshotId || ''] || null);
          setPerson(data.images[s.personId] || null); setGarments(s.garments); setSelected(s.selected); setActiveId(s.activeId); setRender(data.renders.find(r => r.id === s.renderId) || null);
          setFace(data.images[s.faceId || ''] || null); setAvatar(s.avatar || null); setView('photo'); setAvatarPose(s.avatarPose || 'runway');
        }
        const grouped: Record<string, ProductListing[]> = {}; Object.values(data.products).forEach(p => { (grouped[p.garmentId] ||= []).push(p); }); setProducts(grouped); setInventory(data.products); setHistory(data.renders); setReady(true);
      } catch(e) { if (alive.current) setError((e as Error).message); }
    }
    void init(); return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const refresh = async () => { try { const status = await api<ProviderStatus>('status', undefined, 'GET'); if (alive.current) setProviders(status); } catch { /* Keep the previous status until the next probe. */ } };
    const timer = setInterval(() => void refresh(), 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const generation = epoch.current;
    const timer = setTimeout(async () => {
      if (generation !== epoch.current) return;
      try { await enqueueSave.current(async () => {
        if (generation !== epoch.current) return;
        await api('session', { screenshotId: screenshot?.id || null, personId: person?.id || 'studio', garments, selected, activeId, renderId: render?.id || null, faceId: face?.id || null, avatar, view, avatarPose }, 'PATCH');
      }); }
      catch(e) { if (generation === epoch.current) setError(`Could not save session: ${(e as Error).message}`); }
    }, 400);
    return () => clearTimeout(timer);
  }, [ready, screenshot, person, garments, selected, activeId, render, face, avatar, view, avatarPose]);
  const completeOutfit = providers?.tryon.name === 'openai_outfit';
  const signature = outfitSignature(person?.id || 'studio', selected, garments, completeOutfit ? { screenshotId: screenshot?.id, faceId: face?.id } : undefined);
  const currentSignature = useRef(signature); currentSignature.current = signature;
  const required = requiredPieces(garments, completeOutfit);
  const missingSelections = required.filter(g => {
    const product = inventory[selected[g.id]];
    return !product || product.garmentId !== g.id || (completeOutfit && product.isDemo);
  });
  const stale = !!render && render.outfitKey !== signature;
  const search = async (g: Garment, currentFilters = filters, autoSelect = false, imageId = screenshot?.id) => {
    const generation = epoch.current, version = (searchVersions.current[g.id] || 0) + 1; searchVersions.current[g.id] = version;
    const runId = progressRun.current;
    report({ type: 'search-start', runId, now: Date.now(), id: g.id, version });
    setSearching(s => [...new Set([...s, g.id])]); setError('');
    try {
      const result = await api<{ products: ProductListing[]; warnings: string[]; isDemo: boolean; strictMatching?: boolean }>('search', { garment: g, filters: currentFilters, imageId });
      if (generation !== epoch.current || searchVersions.current[g.id] !== version) return;
      setProducts(s => ({ ...s, [g.id]: result.products }));
      setInventory(s => ({ ...(result.strictMatching ? Object.fromEntries(Object.entries(s).filter(([, p]) => p.garmentId !== g.id)) : s), ...Object.fromEntries(result.products.map(p => [p.id, p])) }));
      if (result.strictMatching) setSelected(s => { if (result.products.some(p => p.id === s[g.id])) return s; const next = { ...s }; delete next[g.id]; return next; });
      if (autoSelect && result.products[0]) setSelected(s => ({ ...s, [g.id]: result.products[0].id }));
      if (result.warnings.length) setNotice(result.warnings.join(' '));
      report({ type: 'search-end', runId, now: Date.now(), id: g.id, version, outcome: result.products.length ? 'matched' : 'unmatched' });
    } catch(e) { if (generation === epoch.current && searchVersions.current[g.id] === version) { setError((e as Error).message); report({ type: 'search-end', runId, now: Date.now(), id: g.id, version, outcome: 'failed' }); } }
    finally { if (generation === epoch.current && searchVersions.current[g.id] === version) setSearching(s => s.filter(id => id !== g.id)); }
  };
  const analyze = async (image = screenshot) => {
    if (!image) return; const generation = ++epoch.current; setBusy('Reading the outfit'); setError(''); setSearching([]);
    const runId = beginAnalysis(!!image.isSample);
    let reading = true;
    setGarments([]); setProducts({}); setSelected({}); setRender(null);
    try {
      const result = await api<{ garments: Garment[]; note: string }>('analyze', { imageId: image.id });
      if (generation !== epoch.current) return;
      setGarments(result.garments); setActiveId(result.garments[0]?.id || null); setNotice(result.note); setStep(1);
      reading = false; setBusy('');
      // Two concurrent garment searches at a time.
      const versionsAtAnalysis = { ...searchVersions.current };
      report({ type: 'identified', runId, now: Date.now(), items: result.garments.map(g => ({ id: g.id, version: versionsAtAnalysis[g.id] || 0 })) });
      for (let i = 0; i < result.garments.length; i += 2) { if (generation !== epoch.current) break; await Promise.all(result.garments.slice(i, i + 2).filter(g => queuedSearchIsCurrent(g.id, searchVersions.current, versionsAtAnalysis)).map(g => search(g, defaultFilters, true, image.id))); }
    } catch(e) { if (generation === epoch.current) { setError((e as Error).message); report({ type: 'fail', runId, stage: 'analyze', detail: (e as Error).message }); } }
    // Background shopping must not clear a newer upload or render's busy state.
    finally { if (reading && generation === epoch.current) setBusy(''); }
  };
  const useExample = async () => { reset(); setScreenshot(sampleRef); await analyze(sampleRef); };
  const selectPerson = (image: ImageRef | null) => {
    epoch.current++; poseVersion.current++; photoVersion.current++; desiredPose.current = null;
    setPerson(image); setFace(null); setAvatar(null); setRender(null); setPendingPose(null); setBusy(''); setSearching([]);
  };
  const updateAvatar = (profile: AvatarProfile) => {
    if (profile.referenceId === (person?.id || 'studio') && profile.sourceHash === (person?.hash || 'studio') && profile.faceReferenceId === face?.id) setAvatar(profile);
  };
  const upload = async (file: File, kind: 'screenshot' | 'person' | 'face', consent = false) => {
    if (file.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) { setError('Choose a PNG, JPEG, WebP or AVIF under 8 MB.'); return; }
    const generation = kind === 'screenshot' ? ++epoch.current : epoch.current, photoGeneration = ++photoVersion.current;
    poseVersion.current++; desiredPose.current = null; setPendingPose(null); setSearching([]);
    if (kind === 'screenshot') clearProgress();
    setBusy(kind === 'person' ? 'Preparing your photo' : kind === 'face' ? 'Preparing your face reference' : 'Uploading your screenshot'); setError('');
    try {
      const data = new FormData(); data.set('file', file); data.set('kind', kind); data.set('consent', String(consent));
      const image = await api<ImageRef>('upload', data); if (generation !== epoch.current || photoGeneration !== photoVersion.current) return;
      if (kind === 'person') { setPerson(image); setFace(null); setAvatar(null); setRender(null); setNotice('Your photo is private to this session. Choose Try on this fit to preview all selected items.'); }
      else if (kind === 'face') { setFace(image); setAvatar(null); setNotice('Face reference saved privately. Render the outfit to include it in the next photo preview.'); }
      else { setScreenshot(image); setGarments([]); setProducts({}); setSelected({}); setRender(null); setActiveId(null); setStep(0); setNotice('Screenshot uploaded. Crop or rotate if needed, then analyze the outfit.'); }
    } catch(e) { if (generation === epoch.current && photoGeneration === photoVersion.current) setError((e as Error).message); }
    finally { if (generation === epoch.current && photoGeneration === photoVersion.current) setBusy(''); }
  };
  const editGarment = (updated: Garment) => {
    searchVersions.current[updated.id] = (searchVersions.current[updated.id] || 0) + 1;
    report({ type: 'invalidate-item', runId: progressRun.current, now: Date.now(), id: updated.id, version: searchVersions.current[updated.id] });
    setSearching(s => s.filter(id => id !== updated.id));
    setGarments(s => s.map(g => g.id === updated.id ? { ...updated, segmentation: JSON.stringify(g.bbox) === JSON.stringify(updated.bbox) && g.category === updated.category ? updated.segmentation : undefined } : g));
    setSelected(s => { const next = { ...s }; delete next[updated.id]; return next; });
  };
  const refineGarment = async (g: Garment) => {
    if (!screenshot) return;
    const generation = epoch.current, version = searchVersions.current[g.id];
    setBusy('Refining garment edges'); setError('');
    try {
      const result = await api<{ garments: Garment[]; note: string }>('segment', { imageId: screenshot.id, garments: [g] });
      if (generation !== epoch.current || version !== searchVersions.current[g.id]) return;
      setGarments(s => s.map(item => item.id === g.id ? result.garments[0] : item)); setNotice(result.note);
    } catch (e) { if (generation === epoch.current) setError((e as Error).message); }
    finally { if (generation === epoch.current) setBusy(''); }
  };
  const addGarment = () => { const g: Garment = { id: clientId(), name: 'New piece', category: 'top', attributes: { color: [] }, confidence: 1, searchQueries: [], visible: true, bbox: { x: .25, y: .25, w: .5, h: .35 } }; setGarments(s => [...s, g]); setActiveId(g.id); return g; };
  const poll = async (initial: Job, generation: number, progressId?: number, photoGeneration?: number) => {
    let job = initial;
    while (job.status === 'queued' || job.status === 'running') {
      if (generation !== epoch.current || !alive.current || (photoGeneration !== undefined && photoGeneration !== photoVersion.current)) return null;
      if (progressId !== undefined) report({ type: 'job', runId: progressId, detail: job.progress });
      setBusy(job.progress); await new Promise(r => setTimeout(r, 1000)); job = await api<Job>(`jobs/${job.id}`, undefined, 'GET');
    }
    if (job.status === 'failed') throw new Error(job.error || 'Render failed. Please retry.');
    return job.result || null;
  };
  const generate = async (force = false, retryGarmentId?: string) => {
    if (searching.length) { setError('Wait for the product searches to finish before rendering.'); return; }
    if (!required.length || missingSelections.length) { setError(`Select ${completeOutfit ? 'a real product' : 'a product'} for: ${missingSelections.map(g => g.name).join(', ') || 'at least one visible piece'}.`); return; }
    const generation = epoch.current, photoGeneration = photoVersion.current; setBusy('Preparing your selected outfit'); setError('');
    const runId = beginTryon(providers?.tryon.mode === 'demo');
    try {
      const visibleIds = new Set(garments.filter(g => g.visible).map(g => g.id));
      const job = await api<Job>('tryon', { personId: person?.id || 'studio', screenshotId: screenshot?.id, faceId: face?.id, garments, productIds: Object.entries(selected).filter(([id]) => visibleIds.has(id)).map(([, id]) => id), force, retryGarmentId });
      const result = await poll(job, generation, runId, photoGeneration);
      if (result && generation === epoch.current && photoGeneration === photoVersion.current) {
        setHistory(s => [...s.filter(r => r.id !== result.id), result]);
        if (result.outfitKey !== currentSignature.current) { setNotice('Your outfit changed during rendering. The accepted result is in history; render the current selections to update your preview.'); report({ type: 'fail', runId, stage: 'tryon', detail: 'Outfit changed during rendering' }); return; }
        setRender(result); setStep(2); report({ type: 'complete', runId });
      }
    } catch(e) { if (generation === epoch.current && photoGeneration === photoVersion.current) { setError((e as Error).message); report({ type: 'fail', runId, stage: 'tryon', detail: (e as Error).message }); } }
    finally { if (generation === epoch.current && photoGeneration === photoVersion.current) setBusy(''); }
  };
  const renderPose = async (pose: PoseId) => {
    if (!render || stale) return;
    if (pose === render.pose) return;
    if (providers?.pose.mode !== 'demo' && (providers?.pose.mode !== 'live' || providers.pose.ready === false)) { setNotice('Photo poses will resume when the provider is ready; your last preview is preserved.'); return; }
    const generation = epoch.current, photoGeneration = photoVersion.current, version = poseVersion.current; setPendingPose(pose); setBusy('Preparing pose preview'); setError('');
    try {
      const neutral = baseRenderFor(render, history);
      const result = await poll(await api<Job>('pose', { renderId: neutral.id, pose, faceId: face?.id }), generation, undefined, photoGeneration);
      if (result && generation === epoch.current && photoGeneration === photoVersion.current && version === poseVersion.current && result.outfitKey === currentSignature.current) { setRender(result); setHistory(s => [...s.filter(r => r.id !== result.id), result]); }
    } catch(e) { if (generation === epoch.current && photoGeneration === photoVersion.current && version === poseVersion.current) setError((e as Error).message); }
    finally { if (generation === epoch.current && photoGeneration === photoVersion.current) { setBusy(''); setPendingPose(null); } }
  };
  const choosePose = (pose: PoseId) => {
    setAvatarPose(pose); poseVersion.current++; setPoseIntent(v => v + 1); desiredPose.current = pose; setError('');
    if (!render || stale) setNotice('Try on the current outfit before changing its photo pose.');
    else if (busy) setNotice('The selected photo pose will render after the current job finishes.');
  };
  useEffect(() => {
    if (busy || !render || stale || !desiredPose.current) return;
    const target = desiredPose.current; desiredPose.current = null;
    void renderPose(target);
    // renderPose reads the current references; only queued intent starts a job.
  }, [busy, render, stale, avatarPose, poseIntent, face, providers]);
  const deleteSession = async () => {
    setReady(false); epoch.current++; clearProgress();
    // Invalidate pending operations and clear their indicators even if deletion fails.
    // Their old epoch means their finally handlers can no longer clear this state.
    setBusy(''); setSearching([]); setPendingPose(null);
    try { await api('session', undefined, 'DELETE'); reset(); await api('session'); setReady(true); setNotice('Session deleted. Your local photos, selections and cached results have been removed. External providers manage their own retention.'); }
    catch(e) { setError((e as Error).message); setReady(true); }
  };
  const exportLook = async (format: 'svg' | 'png') => {
    if (!screenshot || !render || stale) return;
    setBusy('Saving your look'); setError('');
    try {
      const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screenshotId: screenshot.id, renderId: render.id, format }) });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()), a = document.createElement('a'); a.href = url; a.download = `dti2irl-${render.pose}.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); setNotice(format === 'svg' ? 'Saved your look card with clickable product links.' : 'Saved your image card. Choose the linked SVG card for clickable product links.');
    } catch(e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  return { ready, pipeline, providers, completeOutfit, required, missingSelections, screenshot, person, face, avatar, updateAvatar, view, setView, avatarPose, personUrl: person?.url || studioImage, garments, activeId, setActiveId, products, inventory, selected, setSelected, filters, setFilters, render, history, setRender, stale, busy, searching, error, setError, notice, step, setStep, pendingPose, search, analyze, useExample, upload, editGarment, refineGarment, addGarment, generate, choosePose, deleteSession, exportLook, setPerson: selectPerson };
}
type Wardrobe = ReturnType<typeof useWardrobeState>;
const Context = createContext<Wardrobe | null>(null);
export function WardrobeProvider({ children }: { children: ReactNode }) { const state = useWardrobeState(); return <Context.Provider value={state}>{children}</Context.Provider>; }
export function useWardrobe() { const value = useContext(Context); if (!value) throw new Error('WardrobeProvider is missing'); return value; }
