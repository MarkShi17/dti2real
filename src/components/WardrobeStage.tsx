'use client';
import { useState, useRef } from 'react';
import { ArrowUpRight, Check, Download, History, LoaderCircle, RefreshCw, Sparkles, Upload, UserRound, X } from 'lucide-react';
import { useWardrobe } from '@/state/wardrobe';
import { POSES, studioImage } from '@/lib/fixtures';
import { compositionOrder } from '@/lib/outfit';
export function WardrobeStage() {
  const w = useWardrobe(), [compare, setCompare] = useState(false), [slider, setSlider] = useState(50), [photoOpen, setPhotoOpen] = useState(false), [consent, setConsent] = useState(false), [historyOpen, setHistoryOpen] = useState(false), [saveOpen, setSaveOpen] = useState(false);
  const personInput = useRef<HTMLInputElement>(null);
  const image = w.render?.image || '/demo/silver-runway.webp';
  const current = w.render && !w.stale;
  const poseEnabled = !!current && !w.busy;
  const core = compositionOrder(w.garments);
  const hasCore = core.length > 0 && core.every(g => w.selected[g.id]);
  return <section className="panel wardrobe-panel" aria-label="Virtual wardrobe and pose studio">
    <div className="panel-heading"><span className="step-number">03</span><h2>The fitting room</h2><button className={`icon-button ${historyOpen ? 'active' : ''}`} aria-label="Show render history" onClick={() => setHistoryOpen(v => !v)}><History size={17}/></button></div>
    <div className="model-toggle"><button className={!w.person ? 'selected' : ''} disabled={!!w.busy} onClick={() => w.setPerson(null)}><UserRound size={14}/> Studio model</button><button className={w.person ? 'selected' : ''} disabled={!!w.busy} onClick={() => setPhotoOpen(v => !v)}><Upload size={14}/> Your photo</button></div>
    {photoOpen && <div className="photo-consent"><div className="row-between"><strong>Your own fitting room</strong><button className="icon-button" aria-label="Close photo upload" onClick={() => setPhotoOpen(false)}><X size={15}/></button></div><p>Choose a clear, full-body photo. Your upload is private to this local session. Sessions expire after 24 hours; Delete my session removes local files immediately.</p><p>{w.providers?.tryon.detail} {w.providers?.pose.mode === 'live' ? w.providers.pose.detail : 'Without a pose editor, personal try-on keeps your original pose.'}</p><label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>This is my photo, or I have permission to use it. I consent to the configured providers processing it when I render.</label><button className="button pink small full" disabled={!consent || !!w.busy} onClick={() => personInput.current?.click()}><Upload size={14}/> Choose person photo</button><input ref={personInput} type="file" className="visually-hidden" accept="image/png,image/jpeg,image/webp,image/avif" aria-label="Person photo file" onChange={e => { if (e.target.files?.[0]) { void w.upload(e.target.files[0], 'person', consent); setPhotoOpen(false); } e.target.value = ''; }}/></div>}
    <div className="wardrobe-stage">
      <img className="wardrobe-photo" src={image} alt={w.render ? `${w.render.isDemo ? 'Pre-rendered sample' : 'AI try-on'} in ${w.render.pose === 'original' ? 'your original photo' : POSES.find(p => p.id === w.render?.pose)?.name} pose` : 'Sample preview of the fictional adult studio model'} data-testid="wardrobe-image"/>
      {compare && <img className="comparison-image" src={w.person?.url || studioImage} alt="Person before try-on" style={{ clipPath: `inset(0 ${100-slider}% 0 0)` }}/>} 
      {compare && <><div className="comparison-divider" style={{ left: `${slider}%` }}><span>↔</span></div><input className="compare-range" type="range" min={0} max={100} value={slider} aria-label="Before and after comparison" onChange={e => setSlider(Number(e.target.value))}/><span className="before-label">Before</span></>}
      <div className="stage-badges"><span>{w.render?.isDemo || !w.render ? 'Sample preview' : 'AI preview'}</span><button className={compare ? 'selected' : ''} onClick={() => setCompare(v => !v)} aria-pressed={compare}>Before / after</button></div>
      <div className="stage-caption"><span>{w.render ? w.render.pose === 'original' ? 'Your original photo pose' : POSES.find(p => p.id === w.render?.pose)?.name : 'Meet your studio muse'}</span><small>{w.render?.isDemo || !w.render ? 'Fictional adult model · pre-rendered' : w.render.provider}</small></div>
      {w.busy && <div className="rendering-overlay"><LoaderCircle size={28} className="spin"/><strong>{w.busy}</strong><span>{w.providers?.tryon.mode === 'demo' ? 'Getting the sample ready' : 'Keep this window open. Live AI may take 30–180 seconds.'}</span></div>}
      {w.stale && !w.busy && <div className="stale-note">Your outfit changed. Render to update this preview.</div>}
    </div>
    <div className="pose-heading"><h3>Strike a pose</h3><span>Make it a moment.</span></div>
    <div className="pose-rail" aria-label="Pose presets">{POSES.map(p => <button key={p.id} className={current && w.render?.pose === p.id ? 'selected' : ''} disabled={!poseEnabled} onClick={() => void w.choosePose(p.id)} aria-label={p.name} aria-pressed={!!current && w.render?.pose === p.id}><div><img src={`/demo/base-${p.id}.webp`} alt=""/>{w.pendingPose === p.id && <LoaderCircle className="spin" size={16}/>}</div><span>{p.short}</span></button>)}</div>
    {!current && <p className="fine-print pose-hint">{w.providers?.tryon.mode === 'demo' ? 'Try on the sample outfit to unlock five distinct poses.' : 'Render your selected outfit first. Additional poses need a configured pose editor.'}</p>}
    <button className="button pink full render-button" disabled={!w.ready || !!w.busy || !hasCore} onClick={() => void w.generate(false)}><Sparkles size={17}/>{w.render ? 'Update this fit' : 'Try on this fit'}<ArrowUpRight size={17}/></button>
    <div className="studio-actions"><button className="text-button" disabled={!current || !!w.busy} onClick={() => setSaveOpen(v => !v)}><Download size={14}/> Save look</button><button className="text-button" disabled={!current || !!w.busy} onClick={() => void w.generate(true)}><RefreshCw size={13}/> Regenerate</button></div>
    {saveOpen && current && <div className="save-options"><button className="button subtle small" onClick={() => void w.exportLook('png')}>Download PNG</button><button className="button subtle small" onClick={() => void w.exportLook('svg')}>Card with links (SVG)</button></div>}
    <p className="render-note">{w.render?.note || 'A sample of the possibilities. Select the example outfit to explore five distinct poses. Live try-on visualizes style, not exact size or fit.'}</p>
    {w.person && <div className="person-reference"><img src={w.person.url} alt="Your selected person reference"/><span>Your photo is selected<small>{w.providers?.tryon.mode === 'demo' ? 'Needs a live try-on provider to render' : 'Used when you choose Try on this fit'}</small></span><Check size={14}/></div>}
    {historyOpen && <div className="render-history"><h3>Previous previews</h3>{w.history.length ? <div>{w.history.slice(-10).reverse().map(r => <button key={r.id} onClick={() => w.setRender(r)} title={`${r.isDemo ? 'Sample' : r.provider} · ${r.pose}`}><img src={r.image} alt={`${r.pose} preview`}/><span>{r.pose}</span></button>)}</div> : <p className="fine-print">Your completed looks will live here for this session.</p>}</div>}
  </section>;
}
