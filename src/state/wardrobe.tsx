'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/client';
import { defaultFilters, type Filters, type Garment, type ImageRef, type Job, type PoseId, type ProductListing, type ProviderStatus, type RenderResult } from '@/lib/schema';
import { outfitSignature } from '@/lib/outfit';
import { sampleImage, studioImage } from '@/lib/fixtures';
import { baseRenderFor, createSaveQueue, queuedSearchIsCurrent } from '@/lib/state-guards';

type SavedState = { screenshotId: string | null; personId: string; garments: Garment[]; selected: Record<string, string>; activeId: string | null; renderId: string | null };
type SessionResponse = { state?: SavedState; images: Record<string, ImageRef>; products: Record<string, ProductListing>; renders: RenderResult[]; providers: ProviderStatus };
function useWardrobeState() {
  const [ready, setReady] = useState(false), [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [screenshot, setScreenshot] = useState<ImageRef | null>(null), [person, setPerson] = useState<ImageRef | null>(null);
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
    epoch.current++; setScreenshot(null); setPerson(null); setGarments([]); setProducts({}); setInventory({}); setSelected({}); setActiveId(null); setRender(null); setHistory([]); setBusy(''); setSearching([]); setNotice(''); setError(''); setStep(0); setPendingPose(null);
  }, []);
  useEffect(() => {
    alive.current = true;
    async function init() {
      try {
        await api('session'); const data = await api<SessionResponse>('session', undefined, 'GET');
        if (!alive.current) return; setProviders(data.providers);
        if (data.state) {
          const s = data.state; setScreenshot(s.screenshotId === 'sample' ? { id: 'sample', url: sampleImage, width: 900, height: 1200, kind: 'screenshot', hash: 'sample', isSample: true } : data.images[s.screenshotId || ''] || null);
          setPerson(data.images[s.personId] || null); setGarments(s.garments); setSelected(s.selected); setActiveId(s.activeId); setRender(data.renders.find(r => r.id === s.renderId) || null);
        }
        const grouped: Record<string, ProductListing[]> = {}; Object.values(data.products).forEach(p => { (grouped[p.garmentId] ||= []).push(p); }); setProducts(grouped); setInventory(data.products); setHistory(data.renders); setReady(true);
      } catch(e) { if (alive.current) setError((e as Error).message); }
    }
    void init(); return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const generation = epoch.current;
    const timer = setTimeout(async () => {
      if (generation !== epoch.current) return;
      try { await enqueueSave.current(async () => {
        if (generation !== epoch.current) return;
        await api('session', { screenshotId: screenshot?.id || null, personId: person?.id || 'studio', garments, selected, activeId, renderId: render?.id || null }, 'PATCH');
      }); }
      catch(e) { if (generation === epoch.current) setError(`Could not save session: ${(e as Error).message}`); }
    }, 400);
    return () => clearTimeout(timer);
  }, [ready, screenshot, person, garments, selected, activeId, render]);
  const signature = outfitSignature(person?.id || 'studio', selected, garments);
  const stale = !!render && render.outfitKey !== signature;
  const search = async (g: Garment, currentFilters = filters, autoSelect = false, imageId = screenshot?.id) => {
    const generation = epoch.current, version = (searchVersions.current[g.id] || 0) + 1; searchVersions.current[g.id] = version;
    setSearching(s => [...new Set([...s, g.id])]); setError('');
    try {
      const result = await api<{ products: ProductListing[]; warnings: string[]; isDemo: boolean }>('search', { garment: g, filters: currentFilters, imageId });
      if (generation !== epoch.current || searchVersions.current[g.id] !== version) return;
      setProducts(s => ({ ...s, [g.id]: result.products }));
      setInventory(s => ({ ...s, ...Object.fromEntries(result.products.map(p => [p.id, p])) }));
      if (autoSelect && result.products[0]) setSelected(s => ({ ...s, [g.id]: result.products[0].id }));
      if (result.warnings.length) setNotice(result.warnings.join(' '));
    } catch(e) { if (generation === epoch.current && searchVersions.current[g.id] === version) setError((e as Error).message); }
    finally { if (generation === epoch.current && searchVersions.current[g.id] === version) setSearching(s => s.filter(id => id !== g.id)); }
  };
  const analyze = async (image = screenshot) => {
    if (!image) return; const generation = ++epoch.current; setBusy('Reading the outfit'); setError(''); setSearching([]);
    setGarments([]); setProducts({}); setSelected({}); setRender(null);
    try {
      const result = await api<{ garments: Garment[]; note: string }>('analyze', { imageId: image.id });
      if (generation !== epoch.current) return;
      setGarments(result.garments); setActiveId(result.garments[0]?.id || null); setNotice(result.note); setStep(1);
      setBusy('');
      // Two concurrent garment searches at a time.
      const versionsAtAnalysis = { ...searchVersions.current };
      for (let i = 0; i < result.garments.length; i += 2) { if (generation !== epoch.current) break; await Promise.all(result.garments.slice(i, i + 2).filter(g => queuedSearchIsCurrent(g.id, searchVersions.current, versionsAtAnalysis)).map(g => search(g, defaultFilters, true, image.id))); }
    } catch(e) { if (generation === epoch.current) setError((e as Error).message); }
    finally { if (generation === epoch.current) setBusy(''); }
  };
  const useExample = async () => { reset(); setScreenshot(sampleRef); await analyze(sampleRef); };
  const upload = async (file: File, kind: 'screenshot' | 'person', consent = false) => {
    if (file.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPEG or WebP under 8 MB.'); return; }
    const generation = kind === 'person' ? epoch.current : ++epoch.current;
    if (kind === 'screenshot') setSearching([]);
    setBusy(kind === 'person' ? 'Preparing your photo' : 'Uploading your screenshot'); setError('');
    try {
      const data = new FormData(); data.set('file', file); data.set('kind', kind); data.set('consent', String(consent));
      const image = await api<ImageRef>('upload', data); if (generation !== epoch.current) return;
      if (kind === 'person') { setPerson(image); setNotice('Your photo is private to this session. Select Try on this fit to send it to the configured try-on provider.'); }
      else { setScreenshot(image); setGarments([]); setProducts({}); setSelected({}); setRender(null); setActiveId(null); setStep(0); setNotice('Screenshot uploaded. Crop or rotate if needed, then analyze the outfit.'); }
    } catch(e) { if (generation === epoch.current) setError((e as Error).message); }
    finally { if (generation === epoch.current) setBusy(''); }
  };
  const editGarment = (updated: Garment) => {
    searchVersions.current[updated.id] = (searchVersions.current[updated.id] || 0) + 1;
    setSearching(s => s.filter(id => id !== updated.id));
    setGarments(s => s.map(g => g.id === updated.id ? updated : g));
    setSelected(s => { const next = { ...s }; delete next[updated.id]; return next; });
  };
  const addGarment = () => { const g: Garment = { id: crypto.randomUUID(), name: 'New piece', category: 'top', attributes: { color: [] }, confidence: 1, searchQueries: [], visible: true, bbox: { x: .25, y: .25, w: .5, h: .35 } }; setGarments(s => [...s, g]); setActiveId(g.id); return g; };
  const poll = async (initial: Job, generation: number) => {
    let job = initial;
    while (job.status === 'queued' || job.status === 'running') {
      if (generation !== epoch.current || !alive.current) return null;
      setBusy(job.progress); await new Promise(r => setTimeout(r, 1000)); job = await api<Job>(`jobs/${job.id}`, undefined, 'GET');
    }
    if (job.status === 'failed') throw new Error(job.error || 'Render failed. Please retry.');
    return job.result || null;
  };
  const generate = async (force = false, retryGarmentId?: string) => {
    const generation = epoch.current; setBusy('Preparing your selected outfit'); setError('');
    try {
      const visibleIds = new Set(garments.filter(g => g.visible).map(g => g.id));
      const job = await api<Job>('tryon', { personId: person?.id || 'studio', garments, productIds: Object.entries(selected).filter(([id]) => visibleIds.has(id)).map(([, id]) => id), force, retryGarmentId });
      const result = await poll(job, generation);
      if (result && generation === epoch.current) { setRender(result); setHistory(s => [...s.filter(r => r.id !== result.id), result]); setStep(2); }
    } catch(e) { if (generation === epoch.current) setError((e as Error).message); }
    finally { if (generation === epoch.current) setBusy(''); }
  };
  const choosePose = async (pose: PoseId) => {
    if (!render || stale) { setError('Try on the current outfit before choosing a pose.'); return; }
    if (pose === render.pose) return;
    const generation = epoch.current; setPendingPose(pose); setBusy('Preparing pose preview'); setError('');
    try {
      const neutral = baseRenderFor(render, history);
      const result = await poll(await api<Job>('pose', { renderId: neutral.id, pose }), generation);
      if (result && generation === epoch.current) { setRender(result); setHistory(s => [...s.filter(r => r.id !== result.id), result]); }
    } catch(e) { if (generation === epoch.current) setError((e as Error).message); }
    finally { if (generation === epoch.current) { setBusy(''); setPendingPose(null); } }
  };
  const deleteSession = async () => {
    setReady(false); epoch.current++;
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
  return { ready, providers, screenshot, person, personUrl: person?.url || studioImage, garments, activeId, setActiveId, products, inventory, selected, setSelected, filters, setFilters, render, history, setRender, stale, busy, searching, error, setError, notice, step, setStep, pendingPose, search, analyze, useExample, upload, editGarment, addGarment, generate, choosePose, deleteSession, exportLook, setPerson };
}
type Wardrobe = ReturnType<typeof useWardrobeState>;
const Context = createContext<Wardrobe | null>(null);
export function WardrobeProvider({ children }: { children: ReactNode }) { const state = useWardrobeState(); return <Context.Provider value={state}>{children}</Context.Provider>; }
export function useWardrobe() { const value = useContext(Context); if (!value) throw new Error('WardrobeProvider is missing'); return value; }
