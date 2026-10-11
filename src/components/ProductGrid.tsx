'use client';
import { useState } from 'react';
import { ArrowUpRight, Check, Search, SlidersHorizontal, RefreshCw, X } from 'lucide-react';
import { useWardrobe } from '@/state/wardrobe';
import { filterAndRank, generateQueries } from '@/lib/ranking';
import { defaultFilters } from '@/lib/schema';

export function ProductGrid() {
  const w = useWardrobe(), [filtersOpen, setFiltersOpen] = useState(false);
  const g = w.garments.find(g => g.id === w.activeId), searching = !!g && w.searching.includes(g.id);
  const candidates = g ? filterAndRank(w.products[g.id] || [], g, w.filters) : [];
  const allSources = [...new Set(Object.values(w.products).flat().map(p => p.source))];
  const selectedProducts = w.garments.filter(g => g.visible).flatMap(g => w.inventory[w.selected[g.id]] ? [w.inventory[w.selected[g.id]]] : []);
  const demo = w.providers?.shopping.mode === 'demo';
  const core = w.required;
  return <section className="panel products-panel" aria-label="Find the pieces">
    <div className="panel-heading"><span className="step-number">2</span><h2>Find pieces</h2><button className={`icon-button ${filtersOpen ? 'active' : ''}`} aria-label="Toggle product filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(v => !v)}><SlidersHorizontal size={17}/></button></div>
    <div className="product-tabs" role="tablist" aria-label="Garment categories">{w.garments.filter(g => g.visible).map(item => <button key={item.id} role="tab" aria-selected={w.activeId === item.id} onClick={() => w.setActiveId(item.id)}>{item.category}{w.selected[item.id] && <span className="tab-dot"/>}</button>)}{!w.garments.length && <span className="muted">Categories appear once your outfit is analyzed.</span>}</div>
    {filtersOpen && <div className="filters"><div className="row-between"><strong>Refine your search</strong><button className="text-button" onClick={() => w.setFilters(defaultFilters)}>Reset</button></div>
      <label>Maximum price (USD)<div className="range-label"><input aria-label="Maximum price in USD" type="number" min={1} max={100000} placeholder="No limit" value={w.filters.priceMax ?? ''} onChange={e => w.setFilters({ ...w.filters, priceMax: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })}/><span>{demo ? 'Sample prices' : 'USD listings only'}</span></div></label>
      <div className="two-fields"><label>Source<select aria-label="Marketplace filter" value={w.filters.marketplaces[0] || ''} onChange={e => w.setFilters({ ...w.filters, marketplaces: e.target.value ? [e.target.value] : [] })}><option value="">All sources</option>{allSources.map(s => <option key={s}>{s}</option>)}</select></label><label>Sort by<select value={w.filters.sortBy} onChange={e => w.setFilters({ ...w.filters, sortBy: e.target.value as typeof w.filters.sortBy })}><option value="best_match">Closest style</option><option value="price_low">Price: low first</option><option value="price_high">Price: high first</option></select></label></div>
      <label className="check-label"><input type="checkbox" checked={w.filters.secondhandOnly} onChange={e => w.setFilters({ ...w.filters, secondhandOnly: e.target.checked })}/>Secondhand only</label>
      <p className="fine-print">A price cap excludes unknown prices and non-USD listings.</p><button className="button subtle small full" disabled={!g || searching} onClick={() => { if (g) void w.search(g); }}>Search with filters</button>
    </div>}
    {g ? <><div className="query-header"><div><h3>{g.name}</h3><p>{[...g.attributes.color, g.attributes.silhouette, g.attributes.material].filter(Boolean).join(' · ')}</p></div><button className="icon-button" aria-label={`Search again for ${g.name}`} disabled={searching || !g.visible} onClick={() => void w.search(g)}><RefreshCw size={16} className={searching ? 'spin' : ''}/></button></div>
      {demo && <div className="demo-inline"><span className="tiny-dot"/>Demo listings & illustrative prices · search links only</div>}
      {!['top', 'bottom', 'dress'].includes(g.category) && <p className="accessory-note">{w.completeOutfit ? 'This piece is required and included in the complete outfit preview.' : 'A finishing touch for your shopping list. This piece is not applied by the try-on model.'}</p>}
      {searching ? <div className="product-grid" aria-label="Searching for products" aria-busy="true">{[0,1,2,3].map(i => <div key={i} className="product-skeleton"><div/><span/><span/></div>)}</div> : candidates.length ? <div className="product-grid">{candidates.slice(0,6).map((p, i) => {
        const chosen = w.selected[g.id] === p.id;
        return <article className={`product-card ${chosen ? 'chosen' : ''}`} key={p.id}>
          <button className="product-image" aria-label={`Select ${p.title}`} aria-pressed={chosen} disabled={!!w.busy} onClick={() => w.setSelected(s => ({ ...s, [g.id]: p.id }))}>
            <img src={p.imageUrl} alt={p.title} loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.src = '/demo/products/other.webp'; }}/>
            <span className={`selection-check ${chosen ? 'checked' : ''}`}>{chosen ? <Check size={14}/> : '+'}</span>{i === 0 && <span className="match-label">Closest style</span>}
          </button>
          <div className="product-copy"><div className="product-source"><span className={p.isDemo ? 'badge' : undefined}>{p.isDemo ? 'Demo listing' : p.source}</span>{p.condition === 'used' && <span className="badge quiet">Pre-loved</span>}</div><h4>{p.title}</h4><div className="price-line"><strong>{p.price !== undefined ? `${p.isDemo ? 'Sample ' : ''}${p.currency === 'USD' ? '$' : p.currency ? `${p.currency} ` : ''}${p.price.toFixed(2)}` : 'Price unavailable'}</strong><a href={p.productUrl} target="_blank" rel="noopener noreferrer" aria-label={`${p.isDemo ? 'Search for' : 'View item'} ${p.title}`} title={p.isDemo ? 'External shopping search, not a live listing' : 'Open retailer listing'}><ArrowUpRight size={18}/></a></div>
            {!p.isDemo && p.retrievedAt && <small className="retrieved">Retrieved {new Date(p.retrievedAt).toLocaleDateString()}</small>}
          </div>
        </article>;
      })}</div> : <div className="empty-products"><Search size={30} strokeWidth={1}/><h3>No close match found</h3><p>Try another color, a more specific name, or fewer filters.</p><button className="button subtle small" onClick={() => { w.setFilters(defaultFilters); void w.search(g, defaultFilters); }}>Search without filters</button><a href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(generateQueries(g)[0])}`} target="_blank" rel="noopener noreferrer" className="text-button">Search the web <ArrowUpRight size={13}/></a></div>}
      <p className="ranking-note">{candidates.some(p => p.matchReason?.startsWith('Visual')) ? 'Ranked with an AI image comparison and garment descriptors. Similarity is an estimate.' : 'Matched by garment type, color, cut & texture keywords.'}</p>
      <a className="text-button depop-search" href={`https://www.depop.com/search/?q=${encodeURIComponent(generateQueries(g)[0])}`} target="_blank" rel="noopener noreferrer">Search Depop <ArrowUpRight size={12}/></a><span className="fine-print"> External search only</span>
    </> : <div className="products-empty"><div className="ghost-grid" aria-hidden="true">{[0,1].map(i => <span key={i}/>)}</div><div className="empty-copy"><h3>Real pieces show up here</h3><p>Each item in your look gets a few shoppable matches: tops, skirts, shoes and the small details.</p></div></div>}
    {selectedProducts.length > 0 && <div className="selected-tray"><div className="row-between"><h3>Your edit <span className="tray-count">{selectedProducts.length}</span></h3></div><div className="tray-items">{selectedProducts.map(p => <div key={p.id} className="tray-item"><button title={p.title} aria-label={`Replace ${p.title}`} onClick={() => w.setActiveId(p.garmentId)}><img src={p.imageUrl} alt={p.title}/></button><button className="tray-remove" aria-label={`Remove ${p.title}`} onClick={() => w.setSelected(s => { const next = { ...s }; delete next[p.garmentId]; return next; })}><X size={10}/></button></div>)}</div><p className="fine-print">Select a thumbnail to swap that piece.</p>{w.view === 'photo' && g && core.some(piece => piece.id === g.id) && core.every(piece => w.selected[piece.id]) && <button className="text-button retry-piece" disabled={!!w.busy || w.searching.length > 0 || w.providers?.tryon.ready === false || (!!w.person && w.providers?.tryon.mode !== 'live')} onClick={() => void w.generate(false, g.id)}><RefreshCw size={12}/>Retry {g.name} in fitting room</button>}</div>}
  </section>;
}
