'use client';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CircleHelp, LoaderCircle, Sparkles, Trash2, X } from 'lucide-react';
import { WardrobeProvider, useWardrobe } from '@/state/wardrobe';
import { OutfitCanvas } from './OutfitCanvas';
import { ProductGrid } from './ProductGrid';
import { WardrobeStage } from './WardrobeStage';
import { ConfirmDialog } from './ConfirmDialog';
import { compositionOrder } from '@/lib/outfit';
import { PipelineBanner } from './PipelineBanner';
function Content() {
  const w = useWardrobe(), [statusOpen, setStatusOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false), [deleteOpen, setDeleteOpen] = useState(false);
  const core = compositionOrder(w.garments);
  const canRender = core.length > 0 && core.every(g => w.selected[g.id]);
  const demo = w.providers && Object.values(w.providers).some(p => p.mode === 'demo');
  return <div className="app-shell">
    <header className="site-header"><a href="/" className="wordmark" aria-label="DTI2IRL home">DTI<span>2</span>IRL<sup>✳</sup></a><nav aria-label="Main navigation"><a className="current" href="#studio">The studio</a><button onClick={() => { setHelpOpen(v => !v); setStatusOpen(false); }}>How it works <CircleHelp size={13}/></button></nav><button className="status-pill" aria-expanded={statusOpen} onClick={() => { setStatusOpen(v => !v); setHelpOpen(false); }}><span className="status-dot"/>{!w.providers ? 'Connecting' : demo ? 'Demo mode' : 'Live providers'}<span className="status-plus">+</span></button></header>
    {statusOpen && <aside className="provider-popover"><div className="row-between"><h3>Provider status</h3><button className="icon-button" aria-label="Close provider status" onClick={() => setStatusOpen(false)}><X size={16}/></button></div>{w.providers && Object.entries(w.providers).map(([key, p]) => <div className="provider-row" key={key}><div><strong>{key === 'shopping' ? 'Products' : key === 'tryon' ? 'Try-on' : key === 'pose' ? 'Poses' : 'Vision'}</strong><span className={`provider-mode ${p.mode}`}>{p.mode === 'live' ? 'Configured' : p.mode}</span></div><p>{p.detail}</p></div>)}<p className="fine-print">Configured means credentials are present, not that a live call has been verified. API keys stay on the server.</p></aside>}
    {helpOpen && <aside className="help-panel"><h3>From game fit to real-world outfit.</h3><ol><li>Upload your screenshot or explore the example.</li><li>Review garment regions and select a match for each piece.</li><li>Try on the fit, choose a pose, and save your look.</li></ol><p>Demo listings and renders are illustrative. Your own images need configured AI providers for recognition and generation. Shopping links open in a new tab.</p><button className="text-button" onClick={() => setHelpOpen(false)}>Got it <Check size={14}/></button></aside>}
    <main id="studio"><section className="hero"><div className="hero-copy"><div className="hero-kicker"><span className="little-star">✳</span> Your imagination. Your wardrobe.</div><h1>Your DTI fit, IRL.</h1><p>Screenshot it. Shop it. Wear it.</p></div><div className="hero-aside"><span className="fashion-stamp">Virtual inspiration.<br/>Real-world expression.</span><button disabled={!w.ready || !!w.busy} className="text-button" onClick={() => void w.useExample()}>Explore an example <ArrowUpRight size={17}/></button></div></section>
      <div className="studio-bar"><div className="studio-title"><span className="live-dot"/>Your personal outfit studio</div><div className="studio-meta">One look. Endless possibilities.<span>US / USD</span></div></div>
      <PipelineBanner progress={w.pipeline} demoSearch={w.providers?.shopping.mode === 'demo'} manualAnalysis={!!w.providers && w.providers.vision.mode !== 'live' && !w.screenshot?.isSample}/>
      <div className="mobile-steps" aria-label="Workflow steps">{['Inspiration', 'Find pieces', 'Fitting room'].map((s,i) => <button key={s} className={w.step === i ? 'selected' : ''} onClick={() => w.setStep(i)}><span>{i+1}</span>{s}</button>)}</div>
      {w.error && <div className="error-banner" role="alert"><div><strong>Something needs your attention</strong><p>{w.error}</p></div><button className="icon-button" aria-label="Dismiss error" onClick={() => w.setError('')}><X size={18}/></button></div>}
      {w.notice && <p className="notice" role="status">{w.notice}</p>}
      <div className={`workbench mobile-step-${w.step}`}><OutfitCanvas/><ProductGrid/><WardrobeStage/></div>
      <div className="studio-footer-note"><Sparkles size={15}/><span>Inspired by your in-game style. Made for your everyday.</span><span className="privacy-caption">Your photos stay private. No sign-in needed.</span></div>
    </main>
    <footer className="site-footer"><div><span className="footer-wordmark">DTI2IRL</span><span>Style has no loading screen.</span></div><div><span>Independent project. Not affiliated with Roblox or Dress to Impress.</span><button className="text-button" disabled={!w.ready} onClick={() => setDeleteOpen(true)}><Trash2 size={12}/>Delete my session</button></div></footer>
    <div className="mobile-next"><button className="button pink full" disabled={!w.ready || !!w.busy || (w.step === 2 && !canRender)} onClick={() => { if (w.step === 0 && w.screenshot && !w.garments.length) void w.analyze(); else if (w.step < 2) w.setStep(w.step + 1); else void w.generate(); }}>{w.busy ? <><LoaderCircle className="spin" size={16}/>{w.busy}</> : <>{w.step === 0 ? w.screenshot && !w.garments.length ? 'Analyze outfit' : 'Find the pieces' : w.step === 1 ? 'Enter the fitting room' : 'Try on this fit'}<ArrowRight size={16}/></>}</button></div>
    {deleteOpen && <ConfirmDialog onClose={() => setDeleteOpen(false)}><h2 id="delete-title">Leave a clean slate?</h2><p>This removes your local photos, selections, and cached previews. External AI services follow their own retention policies.</p><div className="two-fields"><button className="button subtle" autoFocus onClick={() => setDeleteOpen(false)}>Keep my session</button><button className="button pink" onClick={() => { setDeleteOpen(false); void w.deleteSession(); }}>Delete session</button></div></ConfirmDialog>}
  </div>;
}
export function Workbench() { return <WardrobeProvider><Content/></WardrobeProvider>; }
