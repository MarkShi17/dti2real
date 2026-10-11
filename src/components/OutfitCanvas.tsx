'use client';
import { useRef, useState, type PointerEvent } from 'react';
import { Crop, RotateCw, Upload, Plus, ScanLine, Pencil, Eye, EyeOff, X, Check, ImageUp } from 'lucide-react';
import { useWardrobe } from '@/state/wardrobe';
import { categories, type Box, type Garment } from '@/lib/schema';

function GarmentEditor({ garment, close, draw }: { garment: Garment; close: () => void; draw: () => void }) {
  const w = useWardrobe(), [g, setG] = useState(garment);
  return <form className="garment-editor" onSubmit={e => { e.preventDefault(); w.editGarment(g); void w.search(g); close(); }}>
    <div className="row-between"><strong>Edit the piece</strong><button type="button" className="icon-button" aria-label="Close garment editor" onClick={close}><X size={16}/></button></div>
    <label>Piece name<input value={g.name} maxLength={100} required onChange={e => setG({ ...g, name: e.target.value, searchQueries: [] })}/></label>
    <div className="two-fields"><label>Category<select aria-label="Garment category" value={g.category} onChange={e => setG({ ...g, category: e.target.value as Garment['category'], searchQueries: [] })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
    <label>Color<input value={g.attributes.color.join(', ')} onChange={e => setG({ ...g, attributes: { ...g.attributes, color: e.target.value.split(',').map(v => v.trim()) }, searchQueries: [] })}/></label></div>
    <div className="two-fields"><label>Material<input value={g.attributes.material || ''} onChange={e => setG({ ...g, attributes: { ...g.attributes, material: e.target.value }, searchQueries: [] })}/></label><label>Cut / shape<input value={g.attributes.silhouette || ''} onChange={e => setG({ ...g, attributes: { ...g.attributes, silhouette: e.target.value }, searchQueries: [] })}/></label></div>
    <label>Search keywords<input value={g.searchQueries[0] || ''} placeholder="Optional precise shopping query" onChange={e => setG({ ...g, searchQueries: e.target.value ? [e.target.value] : [] })}/></label>
    <div className="two-fields"><button type="button" className="button subtle" onClick={() => { w.editGarment(g); draw(); close(); }}><Crop size={14}/> Redraw region</button><button className="button primary" type="submit"><Check size={14}/> Save & search</button></div>
    {g.category === 'jewelry' && <p className="fine-print">Jewelry uses manual regions; automatic masks are not reliable yet.</p>}
    {g.category !== 'jewelry' && w.providers?.segmentation?.mode === 'live' && !w.screenshot?.isSample && <button type="button" className="button subtle full" disabled={!g.bbox || !!w.busy} onClick={() => { w.editGarment(g); void w.refineGarment(g); close(); }}><ScanLine size={14}/> Refine garment mask</button>}
  </form>;
}
export function OutfitCanvas() {
  const w = useWardrobe(), fileInput = useRef<HTMLInputElement>(null), canvasRef = useRef<HTMLDivElement>(null), imageRef = useRef<HTMLImageElement>(null);
  const [edit, setEdit] = useState<string | null>(null), [drawing, setDrawing] = useState<'region' | 'crop' | null>(null), [box, setBox] = useState<Box | null>(null), [dragging, setDragging] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const editable = w.garments.find(g => g.id === edit);
  async function acceptFile(file: File) {
    if (file.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { w.setError('Choose a PNG, JPEG or WebP image under 8 MB.'); return; }
    const url = URL.createObjectURL(file); setUploadPreview(url);
    try { await w.upload(file, 'screenshot'); }
    finally { setUploadPreview(null); URL.revokeObjectURL(url); }
  }
  function point(e: PointerEvent<HTMLDivElement>) { const r = canvasRef.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; }
  function down(e: PointerEvent<HTMLDivElement>) { if (!drawing) return; origin.current = point(e); setBox(null); e.currentTarget.setPointerCapture(e.pointerId); }
  function move(e: PointerEvent<HTMLDivElement>) { if (!origin.current || !drawing) return; const p = point(e), o = origin.current; setBox({ x: Math.min(p.x, o.x), y: Math.min(p.y, o.y), w: Math.abs(p.x - o.x), h: Math.abs(p.y - o.y) }); }
  function up() { if (!origin.current) return; origin.current = null; if (drawing === 'region' && box && box.w > .02 && box.h > .02) { const g = w.garments.find(g => g.id === w.activeId); if (g) w.editGarment({ ...g, bbox: box }); setDrawing(null); setBox(null); } }
  async function transform(rotate: boolean) {
    const image = imageRef.current; if (!image || !w.screenshot) return;
    const c = document.createElement('canvas'), context = c.getContext('2d')!;
    if (rotate) { c.width = image.naturalHeight; c.height = image.naturalWidth; context.translate(c.width, 0); context.rotate(Math.PI / 2); context.drawImage(image, 0, 0); }
    else if (box) { c.width = Math.round(box.w * image.naturalWidth); c.height = Math.round(box.h * image.naturalHeight); context.drawImage(image, box.x * image.naturalWidth, box.y * image.naturalHeight, c.width, c.height, 0, 0, c.width, c.height); }
    else return;
    c.toBlob(blob => { if (blob) void w.upload(new File([blob], 'outfit.webp', { type: 'image/webp' }), 'screenshot'); }, 'image/webp', .95);
    setDrawing(null); setBox(null);
  }
  const disabled = !w.ready || !!w.busy;
  return <section className="panel source-panel" aria-label="Your inspiration">
    <div className="panel-heading"><span className="step-number">1</span><h2>Inspiration</h2><button className="icon-button" disabled={disabled} title="Upload another screenshot" aria-label="Upload screenshot" onClick={() => fileInput.current?.click()}><Upload size={17}/></button></div>
    <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Outfit screenshot file" onChange={e => { if (e.target.files?.[0]) void acceptFile(e.target.files[0]); e.target.value = ''; }}/>
    {uploadPreview ? <div className="image-canvas"><img src={uploadPreview} alt="Screenshot upload preview"/><p className="image-note" role="status">Preparing your screenshot…</p></div> : w.screenshot ? <>
      <div className="source-toolbar"><span>{w.screenshot.isSample ? 'Example screenshot' : 'Your screenshot'}</span><div className="inline-actions"><button className="icon-button" disabled={disabled} aria-label="Crop screenshot" onClick={() => { setDrawing(drawing === 'crop' ? null : 'crop'); setBox(null); }}><Crop size={15}/></button><button className="icon-button" disabled={disabled} aria-label="Rotate screenshot clockwise" onClick={() => void transform(true)}><RotateCw size={15}/></button></div></div>
      <div className={`image-canvas ${drawing ? 'drawing' : ''}`} ref={canvasRef} style={{ aspectRatio: `${w.screenshot.width}/${w.screenshot.height}` }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        <img ref={imageRef} src={w.screenshot.url} alt="Original outfit inspiration" draggable={false}/>
        {!drawing && w.garments.filter(g => g.id === w.activeId && g.visible && g.segmentation?.sourceImageId === w.screenshot?.id).map(g => <div key={g.id} className="segmentation-overlay" role="img" aria-label={`${g.name} pixel mask`} style={{ maskImage: `url(/api/assets/${g.segmentation!.imageId})`, WebkitMaskImage: `url(/api/assets/${g.segmentation!.imageId})` }}/>) }
        {!drawing && w.garments.filter(g => g.visible && g.bbox).map((g, i) => <button key={g.id} className={`region ${w.activeId === g.id ? 'active' : ''}`} aria-label={`Select ${g.name} region`} style={{ left: `${g.bbox!.x*100}%`, top: `${g.bbox!.y*100}%`, width: `${g.bbox!.w*100}%`, height: `${g.bbox!.h*100}%` }} onClick={() => w.setActiveId(g.id)}><span>{String(i + 1).padStart(2, '0')}</span></button>)}
        {box && <div className="drawn-region" style={{ left: `${box.x*100}%`, top: `${box.y*100}%`, width: `${box.w*100}%`, height: `${box.h*100}%` }}/>}
      </div>
      {drawing && <div className="drawing-controls"><p>{drawing === 'region' ? 'Drag a box around the selected garment. Or enter coordinates below.' : 'Drag to frame your avatar. Cropping clears the current analysis.'}</p>
        {drawing === 'region' && <div className="coordinate-inputs">{(['x','y','w','h'] as const).map(k => <label key={k}>{k.toUpperCase()} %<input type="number" min={0} max={100} value={Math.round((box?.[k] ?? w.garments.find(g => g.id === w.activeId)?.bbox?.[k] ?? .1)*100)} onChange={e => setBox({ ...(box || w.garments.find(g => g.id === w.activeId)?.bbox || { x: .1, y: .1, w: .5, h: .5 }), [k]: Number(e.target.value)/100 })}/></label>)}</div>}
        <div className="row-between"><button className="text-button" onClick={() => { setDrawing(null); setBox(null); }}>Cancel</button><button className="button primary small" disabled={!box || box.w < .02 || box.h < .02} onClick={() => { if (drawing === 'crop') void transform(false); else if (box) { const g = w.garments.find(g => g.id === w.activeId); if (g) w.editGarment({ ...g, bbox: box }); setDrawing(null); setBox(null); } }}>Apply {drawing}</button></div></div>}
      {!w.garments.length && <button className="button primary full" disabled={disabled} onClick={() => void w.analyze()}><ScanLine size={17}/> Analyze outfit</button>}
      {w.garments.length > 0 && <p className="fine-print region-note">{w.garments.some(g => g.segmentation) ? 'Pixel masks where available · other pieces use approximate boxes' : 'Approximate garment regions · click a piece to explore'}</p>}
    </> : <div className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled && e.dataTransfer.files[0]) void acceptFile(e.dataTransfer.files[0]); }}>
      <span className="upload-art" aria-hidden="true"><ImageUp size={24} strokeWidth={1.75}/></span><h3>Drop your screenshot here</h3><p>A full-body shot of your avatar works best.</p>
      <button className="button primary" disabled={disabled} onClick={() => fileInput.current?.click()}><Upload size={16}/> Upload a screenshot</button><span className="fine-print">PNG, JPG or WebP · up to 8 MB</span>
      <div className="or-line"><span>or</span></div><button className="sample-button" disabled={disabled} onClick={() => void w.useExample()}><img src="/demo/sample.webp" alt="Silver pleats example outfit"/><span>Try the silver pleats look<small>A ready-made example</small></span></button>
    </div>}
    {w.screenshot && <div className="detected"><div className="row-between"><h3>{w.garments.length ? `${w.garments.filter(g => g.visible).length} pieces in this look` : 'Build the breakdown'}</h3><button className="text-button" disabled={disabled || w.garments.length >= 16} onClick={() => { const g = w.addGarment(); setEdit(g.id); }}><Plus size={14}/> Add piece</button></div>
      <div className="garment-list">{w.garments.map((g, i) => <div className={`garment-row ${w.activeId === g.id ? 'selected' : ''} ${!g.visible ? 'hidden-piece' : ''}`} key={g.id}>
        <button className="garment-pick" onClick={() => { w.setActiveId(g.id); w.setStep(1); }}><span className="garment-index">{String(i + 1).padStart(2,'0')}</span>{g.bbox && <span className="garment-crop" aria-hidden="true"><img src={g.segmentation?.sourceImageId === w.screenshot!.id ? `/api/assets/${g.segmentation.imageId}` : w.screenshot!.url} alt="" style={{ width: `${100/g.bbox.w}%`, height: `${100/g.bbox.h}%`, left: `${-100*g.bbox.x/g.bbox.w}%`, top: `${-100*g.bbox.y/g.bbox.h}%` }}/></span>}<span><strong>{g.name}</strong><small>{g.category} · {g.attributes.color.join(', ') || 'color not set'}{g.segmentation ? ' · pixel mask' : ''}</small></span></button>
        <button className="icon-button" aria-label={`Edit ${g.name}`} onClick={() => setEdit(edit === g.id ? null : g.id)}><Pencil size={14}/></button><button className="icon-button" aria-label={`${g.visible ? 'Hide' : 'Show'} ${g.name}`} onClick={() => w.editGarment({ ...g, visible: !g.visible })}>{g.visible ? <Eye size={14}/> : <EyeOff size={14}/>}</button>
      </div>)}</div>
      {editable && <GarmentEditor key={editable.id} garment={editable} close={() => setEdit(null)} draw={() => { w.setActiveId(editable.id); setDrawing('region'); setBox(null); }}/>}</div>}
  </section>;
}
