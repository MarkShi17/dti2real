'use client';
import { useState, useRef } from 'react';
import { Box, Image, Check, ChevronsLeftRight, Download, History, LoaderCircle, RefreshCw, Sparkles, Upload, UserRound, X } from 'lucide-react';
import { useWardrobe } from '@/state/wardrobe';
import { POSES, studioImage } from '@/lib/fixtures';
import { AvatarStage } from './AvatarStage';
import { EXAMPLE_ID } from '@/lib/examples';
export function ExampleWardrobeStage() {
  const w = useWardrobe(), [compare, setCompare] = useState(false), [slider, setSlider] = useState(50), [photoOpen, setPhotoOpen] = useState(false), [consent, setConsent] = useState(false), [historyOpen, setHistoryOpen] = useState(false), [saveOpen, setSaveOpen] = useState(false);
  const personInput = useRef<HTMLInputElement>(null);
  const faceInput = useRef<HTMLInputElement>(null);
  const matchingPerson = w.render?.personId === (w.person?.id || 'studio');
  const shownRender = matchingPerson ? w.render : null;
  const current = !!shownRender && !w.stale;
  const show3d = w.view === '3d';
  const poseEnabled = show3d || (!!current && !w.busy);
  const gpuUnavailable = !w.exampleMode && (w.providers?.tryon.mode === 'unavailable' || w.providers?.tryon.ready === false || (w.person && w.providers?.tryon.mode !== 'live'));
  const beforeImage = shownRender?.exampleId && shownRender.pose !== 'original' ? `/demo/fitexample-v1/before-${shownRender.pose}.webp` : w.person?.url || studioImage;
  const hasCore = w.required.length > 0 && !w.missingSelections.length && (!w.completeOutfit || !!w.screenshot);
  return <section className="panel wardrobe-panel" aria-label="Virtual wardrobe and pose studio">
    <div className="panel-heading"><span className="step-number">3</span><h2>Fitting room</h2><button className={`icon-button ${historyOpen ? 'active' : ''}`} aria-label="Show render history" onClick={() => setHistoryOpen(v => !v)}><History size={17}/></button></div>
    <div className="model-toggle"><button className={!w.person ? 'selected' : ''} disabled={!!w.busy} onClick={() => w.setPerson(null)}><UserRound size={14}/> Studio model</button><button className={w.person ? 'selected' : ''} disabled={!!w.busy} onClick={() => setPhotoOpen(v => !v)}><Upload size={14}/> Your photo</button></div>
    {photoOpen && <div className="photo-consent"><div className="row-between"><strong>Your own fitting room</strong><button className="icon-button" aria-label="Close photo upload" onClick={() => setPhotoOpen(false)}><X size={15}/></button></div><p>Choose a clear, full-body photo. Your upload is private to this local session. Sessions expire after 24 hours; Delete my session removes local files immediately.</p><p>{w.providers?.tryon.detail} {w.providers?.pose.mode === 'live' ? w.providers.pose.detail : 'Without a pose editor, personal try-on keeps your original pose.'}</p><label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>This is my photo, or I have permission to use it. I consent to the configured providers processing it when I render.</label><button className="button subtle small full" disabled={!consent || !!w.busy} onClick={() => personInput.current?.click()}><Upload size={14}/> Choose person photo</button><input ref={personInput} type="file" className="visually-hidden" accept="image/png,image/jpeg,image/webp,image/avif" aria-label="Person photo file" onChange={e => { if (e.target.files?.[0]) { void w.upload(e.target.files[0], 'person', consent); setPhotoOpen(false); } e.target.value = ''; }}/></div>}
    {w.person && photoOpen && <div className="photo-consent"><p>Optional: a clear face close-up improves facial detail in photo poses. The same permission and session privacy apply.</p><button className="button subtle small full" disabled={!consent || !!w.busy} onClick={() => faceInput.current?.click()}><Upload size={14}/> Add face close-up</button></div>}
    <input ref={faceInput} type="file" className="visually-hidden" accept="image/png,image/jpeg,image/webp,image/avif" aria-label="Face reference file" onChange={e => { if (e.target.files?.[0]) { void w.upload(e.target.files[0], 'face', consent); setPhotoOpen(false); } e.target.value = ''; }}/>
    <div className="model-toggle" role="group" aria-label="Preview type"><button className={show3d ? 'selected' : ''} aria-pressed={show3d} onClick={() => w.setView('3d')}><Box size={14}/> 3D avatar</button><button className={!show3d ? 'selected' : ''} aria-pressed={!show3d} onClick={() => w.setView('photo')}><Image size={14}/> Photo preview</button></div>
    {show3d ? <AvatarStage profile={w.avatar} personUrl={w.personUrl} personId="studio" sourceHash="studio" exampleId={EXAMPLE_ID} garments={w.garments} products={Object.entries(w.selected).flatMap(([,id]) => w.inventory[id] ? [w.inventory[id]] : [])} pose={w.avatarPose} onProfile={w.updateAvatar} onError={w.setError}/> : <div className="wardrobe-stage" style={{ aspectRatio: '2 / 3' }}>
      {shownRender ? <>
        <img key={shownRender.image} className="wardrobe-photo" src={shownRender.image} alt={`${shownRender.isDemo ? 'Pre-rendered sample' : 'AI try-on'} in ${shownRender.pose === 'original' ? 'your original photo' : POSES.find(p => p.id === shownRender.pose)?.name} pose`} data-testid="wardrobe-image"/>
        {compare && <img className="comparison-image" src={beforeImage} alt="Person before try-on" style={{ clipPath: `inset(0 ${100-slider}% 0 0)` }}/>}
        {compare && <><div className="comparison-divider" style={{ left: `${slider}%` }}><span><ChevronsLeftRight size={16}/></span></div><input className="compare-range" type="range" min={0} max={100} value={slider} aria-label="Before and after comparison" onChange={e => setSlider(Number(e.target.value))}/><span className="before-label">Before</span></>}
        <div className="stage-badges"><span>{shownRender.isDemo ? 'Sample preview' : 'AI preview'}</span><button className={compare ? 'selected' : ''} onClick={() => setCompare(v => !v)} aria-pressed={compare}>Before / after</button></div>

      </> : <div className="wardrobe-placeholder" data-testid="wardrobe-placeholder"><strong>Your outfit preview will appear here</strong><span>Find your matches, then choose Try on this fit.</span></div>}
      {w.busy && <div className="rendering-overlay"><LoaderCircle size={28} className="spin"/><strong>{w.busy}</strong><span>{w.exampleMode ? w.pendingPose ? 'Preparing your preloaded pose' : 'Preparing the preloaded example' : w.providers?.tryon.mode === 'demo' ? 'Getting the sample ready' : w.completeOutfit ? 'Layering, generation and quality checks can take up to 20 minutes.' : 'Keep this window open. Live AI may take 30–180 seconds.'}</span></div>}
      {w.stale && !w.busy && <div className="stale-note">Your outfit changed. Render to update this preview.</div>}
    </div>}
    {!show3d && shownRender && <div className="stage-caption" style={{ position: 'static', margin: '8px 0', maxWidth: '100%' }}><span>{shownRender.pose === 'original' ? 'Your original photo pose' : POSES.find(p => p.id === shownRender.pose)?.name}</span><small>Fictional adult model · pre-rendered</small></div>}
    <div className="pose-heading"><h3>Strike a pose</h3></div>
    <div className="pose-rail" aria-label="Pose presets">{POSES.map(p => <button key={p.id} className={(show3d ? w.avatarPose === p.id : current && shownRender?.pose === p.id) ? 'selected' : ''} disabled={!poseEnabled} onClick={() => w.choosePose(p.id)} aria-label={p.name} aria-pressed={show3d ? w.avatarPose === p.id : current && shownRender?.pose === p.id}><div>{w.exampleMode ? <img src={`/demo/fitexample-v1/${p.id}.webp`} alt=""/> : w.pendingPose !== p.id && <UserRound size={16} aria-hidden="true"/>}{w.pendingPose === p.id && <LoaderCircle className="spin" size={16}/>}</div><span>{p.short}</span></button>)}</div>
    {!show3d && !current && <p className="fine-print pose-hint">{w.exampleMode ? 'The example preview will appear automatically. Five preloaded poses follow.' : w.providers?.tryon.mode === 'demo' ? 'Try on the sample outfit to unlock five distinct poses.' : 'Render your selected outfit first. Additional poses need a configured pose editor.'}</p>}
    {gpuUnavailable && <p className="fine-print" role="status">{w.providers?.tryon.detail}</p>}
    {!w.exampleMode && w.providers?.tryon.expiresAt && <p className="fine-print">Photo rendering is available until {new Date(w.providers.tryon.expiresAt).toLocaleString()}.</p>}
    {!show3d && <>
    {w.missingSelections.length > 0 && <div className="missing-selections"><p className="fine-print">Choose {w.completeOutfit ? 'a real product' : 'a product'} for every required piece:</p>{w.missingSelections.map(g => <button key={g.id} className="text-button" onClick={() => { w.setActiveId(g.id); w.setStep(1); }}>{g.name}</button>)}</div>}
    <button className="button primary full render-button" disabled={!w.ready || !!w.busy || w.searching.length > 0 || !hasCore || !!gpuUnavailable} onClick={() => void w.generate(false)}><Sparkles size={17}/>{w.searching.length ? 'Finding the pieces…' : w.render ? 'Update this fit' : 'Try on this fit'}</button>
    <div className="studio-actions"><button className="text-button" disabled={!current || !!w.busy} onClick={() => setSaveOpen(v => !v)}><Download size={14}/> Save look</button><button className="text-button" disabled={!current || !!w.busy} onClick={() => void w.generate(true)}><RefreshCw size={13}/> Regenerate</button></div>
    {saveOpen && current && <div className="save-options"><button className="button subtle small" onClick={() => void w.exportLook('png')}>Download PNG</button><button className="button subtle small" onClick={() => void w.exportLook('svg')}>Card with links (SVG)</button></div>}
    <p className="render-note">{shownRender?.note || 'Choose your matches, then render the complete outfit. Your preview appears when the render finishes. Live try-on visualizes style, not exact size or fit.'}</p>
    </>}
    {w.person && <div className="person-reference"><img src={w.person.url} alt="Your selected person reference"/><span>Your photo is selected<small>{w.providers?.tryon.mode === 'demo' ? 'Needs a live try-on provider to render' : 'Used when you choose Try on this fit'}</small></span><Check size={14}/></div>}
    {historyOpen && <div className="render-history"><h3>Previous previews</h3>{w.history.length ? <div>{w.history.slice(-10).reverse().map(r => <button key={r.id} onClick={() => w.setRender(r)} title={`${r.isDemo ? 'Sample' : r.provider} · ${r.pose}`}><img src={r.image} alt={`${r.pose} preview`}/><span>{r.pose}</span></button>)}</div> : <p className="fine-print">Your completed looks will live here for this session.</p>}</div>}
  </section>;
}
