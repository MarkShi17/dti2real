'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, RotateCcw, SlidersHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import type { Garment, PoseId, ProductListing } from '@/lib/schema';
import { type AvatarProfile, studioProfile } from '@/lib/avatar/profile';
import { profileMatches } from '@/lib/avatar/proportions';
import { analyzePerson } from '@/lib/avatar/analysis';
import type { AvatarRenderer } from '@/lib/avatar/renderer';

export type AvatarStageProps = {profile:AvatarProfile|null;personUrl:string;personId:string;sourceHash:string;faceUrl?:string;faceReferenceId?:string;outfitUrl?:string;garments:Garment[];products:ProductListing[];pose:PoseId;onProfile:(profile:AvatarProfile)=>void;onError:(message:string)=>void};
export function AvatarStage(props:AvatarStageProps) {
  const host=useRef<HTMLDivElement>(null),engine=useRef<AvatarRenderer|null>(null),callbacks=useRef(props),downloadUrls=useRef(new Set<string>());
  callbacks.current=props;
  const [ready,setReady]=useState(false),[failed,setFailed]=useState(''),[analysis,setAnalysis]=useState(''),[adjusting,setAdjusting]=useState(false),[snapshotting,setSnapshotting]=useState(false);
  const [localProfile,setLocalProfile]=useState<AvatarProfile>(studioProfile);
  const [engineVersion,setEngineVersion]=useState(0);
  const [textureNotice,setTextureNotice]=useState('');
  const profile=props.profile && profileMatches(props.profile,props.personId,props.sourceHash,props.faceReferenceId) ? props.profile : profileMatches(localProfile,props.personId,props.sourceHash,props.faceReferenceId) ? localProfile : {...studioProfile(),referenceId:props.personId,sourceHash:props.sourceHash,...(props.faceReferenceId?{faceReferenceId:props.faceReferenceId}:{})};
  const profileKey=JSON.stringify(profile),outfitKey=JSON.stringify([props.garments,props.products,props.outfitUrl]);
  const profileRef=useRef(profile);profileRef.current=profile;
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    void import('@/lib/avatar/renderer').then(async ({createAvatarRenderer})=>{
      if(!host.current || !active)return;
      const renderer=await createAvatarRenderer(host.current,(message)=>{if(!active)return;setFailed(message);callbacks.current.onError(message);},controller.signal,(message)=>{if(active)setTextureNotice(message);});
      if(!active){renderer.dispose();return;}
      engine.current=renderer;setReady(true);setEngineVersion(v=>v+1);
    }).catch(error=>{if(!active || controller.signal.aborted)return;const message=`The 3D avatar could not start. Enable WebGL in your browser or try another browser. ${error instanceof Error?error.message:''}`;setFailed(message);callbacks.current.onError(message);});
    const urls=downloadUrls.current;
    return ()=>{active=false;controller.abort();engine.current?.dispose();engine.current=null;urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    const {personId,sourceHash,faceReferenceId,faceUrl,personUrl}=props;
    if(props.profile && profileMatches(props.profile,personId,sourceHash,faceReferenceId)){setAnalysis('');return ()=>controller.abort();}
    if(personId==='studio' && !faceUrl){const p={...studioProfile(),sourceHash};setLocalProfile(p);setAnalysis('Fictional adult studio model');callbacks.current.onProfile(p);return ()=>controller.abort();}
    setAnalysis('Analyzing your photo locally…');
    void analyzePerson({personId,sourceHash,faceReferenceId,faceUrl,personUrl},controller.signal).then(result=>{
      if(!active || controller.signal.aborted)return;
      setLocalProfile(result.profile);callbacks.current.onProfile(result.profile);
      setAnalysis(result.bodyDetected ? result.faceDetected ? 'Photo proportions and face initialized. Fine-tune below.' : 'Body initialized. Add a clear face close-up for facial detail.' : 'Full body could not be detected. Adjust proportions below.');
    }).catch(error=>{if(!active || controller.signal.aborted)return;setAnalysis(error instanceof Error?error.message:'Photo analysis unavailable. Adjust proportions below.');});
    return ()=>{active=false;controller.abort();};
  // Saving the result must not cancel a completed analysis or reset user edits.
  },[props.personId,props.sourceHash,props.personUrl,props.faceUrl,props.faceReferenceId]);
  useEffect(()=>{
    const active=engine.current;if(!active)return;
    const controller=new AbortController();
    const current=profileRef.current;
    void active.setProfile(current,current.referenceId==='studio' && !props.faceUrl ? undefined : props.faceUrl || props.personUrl).catch(error=>{if(!controller.signal.aborted)setAnalysis(error instanceof Error?error.message:'Face texture could not be loaded.');});
    return ()=>controller.abort();
  },[profileKey,props.faceUrl,props.personUrl,engineVersion]);
  useEffect(()=>{const current=callbacks.current;engine.current?.setOutfit(current.garments,current.products,current.outfitUrl);},[outfitKey,engineVersion]);
  useEffect(()=>{engine.current?.setPose(props.pose);},[props.pose,engineVersion]);
  function adjust(key:keyof AvatarProfile['proportions'],value:number) {const p={...profileRef.current,proportions:{...profileRef.current.proportions,[key]:value}};setLocalProfile(p);props.onProfile(p);}
  async function snapshot() {
    if(!engine.current)return;setSnapshotting(true);
    try {const blob=await engine.current.snapshot(),url=URL.createObjectURL(blob);downloadUrls.current.add(url);const link=document.createElement('a');link.href=url;link.download=`dti2irl-avatar-${props.pose}.png`;link.click();window.setTimeout(()=>{URL.revokeObjectURL(url);downloadUrls.current.delete(url);},1000);}
    catch(error){props.onError(error instanceof Error?error.message:'Could not save the 3D snapshot.');}
    finally {setSnapshotting(false);}
  }
  return <div className="avatar-stage" data-testid="avatar-stage" data-pose={props.pose} data-ready={ready && !failed ? 'true':'false'}>
    <div className="avatar-viewport">
      <div ref={host} className="avatar-canvas-host"/>
      {!ready && !failed && <div role="status" className="avatar-overlay"><LoaderCircle className="spin"/><span>Loading your 3D fitting room…</span></div>}
      {failed && <div role="alert" className="avatar-overlay failed"><strong>3D avatar unavailable</strong><p>{failed}</p></div>}
      <span className="avatar-tag">3D style preview</span>
      <span className="avatar-hint">Drag to rotate · scroll or pinch to zoom</span>
    </div>
    <div className="avatar-view-controls" aria-label="3D view controls">
      <button className="button subtle small" disabled={!ready || !!failed} onClick={()=>engine.current?.view('front')}>Front</button>
      <button className="button subtle small" disabled={!ready || !!failed} onClick={()=>engine.current?.view('back')}>Back</button>
      <button className="icon-button" aria-label="Reset 3D view" disabled={!ready || !!failed} onClick={()=>engine.current?.view('reset')}><RotateCcw size={15}/></button>
      <button className="icon-button" aria-label="Zoom in" disabled={!ready || !!failed} onClick={()=>engine.current?.zoom(-.25)}><ZoomIn size={16}/></button>
      <button className="icon-button" aria-label="Zoom out" disabled={!ready || !!failed} onClick={()=>engine.current?.zoom(.25)}><ZoomOut size={16}/></button>
      <button className={`icon-button ${adjusting?'active':''}`} aria-label="Adjust body proportions" aria-expanded={adjusting} onClick={()=>setAdjusting(v=>!v)}><SlidersHorizontal size={16}/></button>
      <button className="icon-button" aria-label="Download 3D snapshot" disabled={!ready || !!failed || snapshotting} onClick={()=>void snapshot()}>{snapshotting?<LoaderCircle size={16} className="spin"/>:<Download size={16}/>}</button>
    </div>
    <p className="fine-print avatar-note" role="status">{analysis || (props.personId==='studio'?'Fictional adult studio model':'Photo-based proportions · best-effort facial likeness')} · Garments approximate shape, color, and pattern; sizing and fit are not measured.</p>
    {textureNotice && <p className="fine-print avatar-note" role="status">{textureNotice}</p>}
    {adjusting && <fieldset className="avatar-proportions"><legend>Fine-tune your proportions</legend>{(['shoulder','waist','hips','torso','legs'] as const).map(key=><label key={key}><span>{({shoulder:'Shoulders',waist:'Waist',hips:'Hips',torso:'Torso',legs:'Legs'})[key]}</span><input type="range" min={.65} max={1.35} step={.01} value={profile.proportions[key]} aria-label={`${key==='shoulder'?'Shoulders':key[0].toUpperCase()+key.slice(1)} proportion`} onChange={event=>adjust(key,Number(event.target.value))}/><output>{Math.round(profile.proportions[key]*100)}%</output></label>)}<button className="text-button" onClick={()=>{const p={...profile,proportions:studioProfile().proportions};setLocalProfile(p);props.onProfile(p);}}>Reset proportions</button></fieldset>}
  </div>;
}
