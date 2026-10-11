import type { Garment, ProductListing } from '@/lib/schema';
const colors: [RegExp,string][] = [
  [/burgundy|wine|maroon|oxblood/i,'#713446'],[/silver|chrome|metallic/i,'#bdc0c5'],[/gold/i,'#bb965b'],[/black|charcoal/i,'#242229'],[/white|ivory|cream|off.white/i,'#eae3d6'],[/navy/i,'#27334b'],[/blue|denim/i,'#56708c'],[/pink|rose|blush/i,'#d4a2b5'],[/red/i,'#b4434b'],[/green|sage|olive/i,'#747e62'],[/purple|lilac|lavender/i,'#a59abb'],[/brown|chocolate/i,'#6c5045'],[/beige|tan|camel/i,'#b59a80'],[/orange/i,'#c27e50'],[/yellow/i,'#d6c477'],
];
export type GarmentAppearance = {template:'top'|'tank'|'knit'|'blouse'|'jacket'|'trousers'|'miniskirt'|'midiskirt'|'dress'|'shoes'|'bag'|'jewelry'|'headwear'|'tights'|'legwarmers'|'belt'|'other';color:string;metalness:number;roughness:number;pattern:'solid'|'stripes'|'plaid'|'dots'|'floral';wide:boolean;cropped:boolean;long?:boolean;sheer?:boolean;dressLength?:'mini'|'midi'|'maxi'};
export function garmentAppearance(g:Garment,p?:ProductListing): GarmentAppearance {
  const source=p ? `${p.title} ${p.variant || ''}` : `${g.name} ${g.attributes.color.join(' ')} ${g.attributes.silhouette || ''} ${g.attributes.material || ''} ${g.attributes.pattern || ''} ${(g.attributes.details || []).join(' ')}`;
  const color=colors.find(([re])=>re.test(source))?.[1] || colors.find(([re])=>re.test(g.attributes.color.join(' ')))?.[1] || '#aaa2ad';
  const category=p?.category || g.category;
  let template:GarmentAppearance['template']=category==='other'?'other':'top';
  if(category==='bottom') template=/skirt|(?:maxi|midi|pleat)(?!.*(?:pants|trousers))/i.test(source) ? /midi|maxi|long/i.test(source)?'midiskirt':'miniskirt' : 'trousers';
  else if(category==='top') template=/tank|sleeveless|camisole|spaghetti|halter/i.test(source)?'tank':/long.?sleeve|sweater|knit|turtleneck/i.test(source)?'knit':/blouse|shirt|sleeve/i.test(source)?'blouse':'top';
  else if(category==='outerwear') template='jacket';
  else if(category==='hosiery')template=/leg.?warm/i.test(source)?'legwarmers':'tights';
  else if(category!=='other') template=category;
  else if(/belt/i.test(source))template='belt';
  const metallic=/silver|metallic|sequin|chrome|gold/i.test(source), satin=/satin|silk|leather|patent/i.test(source);
  const pattern:GarmentAppearance['pattern']=/plaid|gingham|tartan|check/i.test(source)?'plaid':/stripe/i.test(source)?'stripes':/polka|dots/i.test(source)?'dots':/floral|flower/i.test(source)?'floral':'solid';
  return {template,color:template==='bag' && /black/i.test(source)?'#242229':template==='legwarmers' && /white.{0,12}leg.?warm|leg.?warm.{0,12}white/i.test(source)?'#eae3d6':color,metalness:metallic && template!=='bag'?.62:0,roughness:metallic?.32:satin?.43:.85,pattern,wide:/wide|flare|a.line|pleat/i.test(`${source} ${g.attributes.silhouette || ''}`),cropped:/crop/i.test(source),long:template==='midiskirt' && /maxi|full.length|ankle/i.test(source),sheer:template==='tights' && /sheer|transparent|[1234]0.?denier/i.test(source),dressLength:/mini|short/i.test(source)?'mini':/maxi|full.length|ankle/i.test(source)?'maxi':'midi'};
}

export type OutfitPiece={mesh:string;appearance:GarmentAppearance;garment:Garment;product?:ProductListing};
export function outfitPlan(garments:Garment[],products:ProductListing[]):OutfitPiece[] {
  return garments.filter(g=>g.visible).flatMap(garment=>{
    const product=products.find(p=>p.garmentId===garment.id),appearance=garmentAppearance(garment,product);
    if(appearance.template==='dress')return [
      {mesh:'dressbodice',appearance,garment,product},
      {mesh:appearance.dressLength==='mini'?'miniskirt':'midiskirt',appearance:{...appearance,long:appearance.dressLength==='maxi'},garment,product},
    ];
    return [{mesh:appearance.template,appearance,garment,product}];
  });
}
