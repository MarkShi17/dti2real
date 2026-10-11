#!/usr/bin/env python3
"""Reproducible offline MakeHuman OBJ + rig + weights -> GLB, no GUI.
Run python3 scripts/package-avatar.py. Sources are pinned in public/avatar/SOURCES.json.
All helper faces are excluded from the rendered body. Garments use MHCLO bindings.
"""
import json, math, struct, hashlib, shutil, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/avatar'
SRC = OUT / 'source'

def obj(path):
    v, uv, faces, group = [], [], [], 'body'
    for line in path.read_text().splitlines():
        p = line.split()
        if not p: continue
        if p[0] == 'v': v.append([float(x) for x in p[1:4]])
        elif p[0] == 'vt': uv.append([float(p[1]), 1-float(p[2])])
        elif p[0] == 'g': group = p[1]
        elif p[0] == 'f':
            corners = [(int(x.split('/')[0])-1, int(x.split('/')[1])-1 if '/' in x and x.split('/')[1] else 0) for x in p[1:]]
            for i in range(1, len(corners)-1): faces.append((group,[corners[0],corners[i],corners[i+1]]))
    return v, uv, faces

base, buv, bfaces = obj(SRC/'base.obj')
morphed = [p[:] for p in base]
for name in ['caucasian-female-young.target','universal-female-young-averagemuscle-averageweight.target']:
    for line in (SRC/name).read_text().splitlines():
        if not line or line.startswith('#'): continue
        p=line.split(); i=int(p[0])
        for axis in range(3): morphed[i][axis]+=float(p[axis+1])
floor=min(morphed[i][1] for group,f in bfaces if group=='body' for i,_ in f)
scale=.1
world=lambda p: [p[0]*scale,(p[1]-floor)*scale,p[2]*scale]
rig=json.loads((SRC/'default.mhskel').read_text())
names=list(rig['bones']); bindex={n:i for i,n in enumerate(names)}
weights=[{} for _ in base]
for name,pairs in json.loads((SRC/'default_weights.mhw').read_text())['weights'].items():
    for i,w in pairs: weights[i][bindex[name]]=weights[i].get(bindex[name],0)+w

def reduced(ws):
    items=sorted(((i,max(0,w)) for i,w in ws.items()),key=lambda p:p[1],reverse=True)[:4]
    total=sum(w for _,w in items)
    if total<=0: items=[(bindex['root'],1)];total=1
    return [i for i,_ in items]+[0]*(4-len(items)), [w/total for _,w in items]+[0.]*(4-len(items))

heads={}
for name,b in rig['bones'].items():
    ids=rig['joints'][b['head']]
    heads[name]=world([sum(morphed[i][a] for i in ids)/len(ids) for a in range(3)])
nodes=[]
for name,b in rig['bones'].items():
    head=heads[name];parent=b.get('parent'); ph=heads[parent] if parent else [0,0,0]
    nodes.append({'name':name,'translation':[head[a]-ph[a] for a in range(3)],'children':[],'extras':{'bindHead':head,'originalName':name}})
for name,b in rig['bones'].items():
    if b.get('parent'): nodes[bindex[b['parent']]]['children'].append(bindex[name])

buffers=bytearray();views=[];accessors=[];meshes=[];materials=[]
def accessor(values,ctype,kind,width, bounds=False):
    while len(buffers)%4:buffers.append(0)
    offset=len(buffers); fmt={5126:'f',5123:'H',5125:'I'}[ctype]
    data=struct.pack('<'+fmt*len(values),*values);buffers.extend(data)
    view=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
    acc={'bufferView':view,'componentType':ctype,'count':len(values)//width,'type':kind}
    if bounds:
        acc['min']=[min(values[i::width]) for i in range(width)];acc['max']=[max(values[i::width]) for i in range(width)]
    accessors.append(acc);return len(accessors)-1

def mesh(name, verts, uvs, faces, ws, color, category):
    # Accumulate normals by original vertex, then split only UV seams.
    normals=[[0.,0.,0.] for _ in verts]
    for _,f in faces:
        a,b,c=[verts[i] for i,_ in f];u=[b[j]-a[j] for j in range(3)];v=[c[j]-a[j] for j in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        for i,_ in f:
            for j in range(3): normals[i][j]+=n[j]
    positions=[]; tex=[]; norm=[]; joints=[]; weight=[];indices=[];lookup={}
    for _,f in faces:
        for key in f:
            if key not in lookup:
                i,t=key;lookup[key]=len(lookup);positions.extend(world(verts[i]));tex.extend(uvs[t] if uvs else [0,0])
                n=normals[i];length=math.sqrt(sum(x*x for x in n)) or 1;norm.extend(x/length for x in n)
                ji,we=reduced(ws[i]);joints.extend(ji);weight.extend(we)
            indices.append(lookup[key])
    if not indices: return
    mat=len(materials);materials.append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':0,'roughnessFactor':.75},'doubleSided':category!='body'})
    attrs={'POSITION':accessor(positions,5126,'VEC3',3,True),'NORMAL':accessor(norm,5126,'VEC3',3),'TEXCOORD_0':accessor(tex,5126,'VEC2',2),'JOINTS_0':accessor(joints,5123,'VEC4',4),'WEIGHTS_0':accessor(weight,5126,'VEC4',4)}
    mi=len(meshes);meshes.append({'name':name,'primitives':[{'attributes':attrs,'indices':accessor(indices,5125,'SCALAR',1),'material':mat}]})
    nodes.append({'name':name,'mesh':mi,'skin':0,'extras':{'category':category}})

mesh('body',morphed,buv,[(g,f) for g,f in bfaces if g=='body'],weights,[1,1,1,1],'body')

# Additional fitted garment shells derive from the real MakeHuman surface and
# retain its skin weights. Open necklines/armholes are actual absent faces.
bodyfaces=[(g,f) for g,f in bfaces if g=='body']
body_normals=[[0.,0.,0.] for _ in morphed]
for _,face in bodyfaces:
    a,b,c=[morphed[i] for i,_ in face];u=[b[j]-a[j] for j in range(3)];v=[c[j]-a[j] for j in range(3)]
    normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
    for i,_ in face:
        for j in range(3):body_normals[i][j]+=normal[j]
def tank_surface(p):
    x,y,z=p
    if not (.94<y<1.405 and abs(x)<.195):return False
    if y>1.245 and abs(x)>.162:return False
    neckline=(1.265 if z>0 else 1.33)+min(abs(x)/.10,1)*(.14 if z>0 else .075)
    return y<neckline
def knit_surface(p):
    x,y,z=p
    return .88<y<1.397 and abs(x)<.44 and not (y>1.35 and abs(x)<.075 and z>.10)
def fitted_shell(name,predicate,offset,color,transform=None):
    included={i for i,p in enumerate(morphed) if predicate(world(p)) and not (name in ['knit','tights'] and sum(w for b,w in weights[i].items() if names[b].startswith(('wrist','finger')))>.099)}
    faces=[f for f in bodyfaces if all(i in included for i,_ in f[1])]
    verts=[p[:] for p in morphed]
    for i in included:
        n=body_normals[i];length=math.sqrt(sum(v*v for v in n)) or 1
        verts[i]=[p+n[j]/length*offset/scale for j,p in enumerate(verts[i])]
        if transform:
            w=transform(world(verts[i]));verts[i]=[w[0]/scale,w[1]/scale+floor,w[2]/scale]
    mesh(name,verts,buv,faces,weights,color,'top' if name in ['tank','knit','dressbodice'] else 'bottom')
def tailored_tank(name,offset,color):
    # Clip existing real-body triangles against continuous tailoring planes.
    # Interpolated UVs and skin weights preserve articulation at every new edge.
    samples=[world(p) for p in morphed]
    def surface(i):
        p=samples[i][:];n=body_normals[i];length=math.sqrt(sum(v*v for v in n)) or 1
        p=[p[j]+n[j]/length*offset for j in range(3)]
        if p[2]>.04 and abs(p[0])<.18 and 1.04<p[1]<1.29:
            envelope=.115+.050*math.exp(-((p[1]-1.185)/.10)**2)+offset-.018*(p[0]/.18)**2
            taper=min(1,(p[1]-1.04)/.05,(1.29-p[1])/.035)*min(1,(.18-abs(p[0]))/.035)
            p[2]=p[2]*(1-.98*taper)+envelope*.98*taper
        return p
    adjusted={i:surface(i) for i,p in enumerate(samples) if .84<p[1]<1.45 and abs(p[0])<.24}
    verts=[];uvs=[];faces=[];ws=[];lookup={};uv_lookup={}
    def interpolate(a,b,t):
        merged={}
        for key in set(a[5])|set(b[5]):merged[key]=a[5].get(key,0)*(1-t)+b[5].get(key,0)*t
        return [a[j]*(1-t)+b[j]*t for j in range(5)]+[merged]
    def clip(poly,plane):
        result=[]
        for a,b in zip(poly,poly[1:]+poly[:1]):
            fa,fb=plane(a),plane(b)
            if fa>=-1e-10:result.append(a)
            if (fa>=0)!=(fb>=0):result.append(interpolate(a,b,fa/(fa-fb)))
        return result
    def corner(v):
        key=tuple(round(q,9) for q in v[:3])
        if key not in lookup:
            lookup[key]=len(verts);verts.append([v[0]/scale,v[1]/scale+floor,v[2]/scale]);ws.append(v[5])
        uv_key=tuple(round(q,9) for q in v[3:5])
        if uv_key not in uv_lookup:uv_lookup[uv_key]=len(uvs);uvs.append(v[3:5])
        return (lookup[key],uv_lookup[uv_key])
    breaks=[-.195,-.155,-.10,0,.10,.155,.195]
    for _,face in bodyfaces:
        if not all(i in adjusted for i,_ in face):continue
        polygon=[adjusted[i]+buv[t]+[weights[i]] for i,t in face]
        front=sum(v[2] for v in polygon)>0
        for lo,hi in zip(breaks,breaks[1:]):
            poly=polygon
            for plane in [lambda v,lo=lo:v[0]-lo,lambda v,hi=hi:hi-v[0],lambda v:v[1]-.885,lambda v:1.405-v[1]]:
                poly=clip(poly,plane)
                if len(poly)<3:break
            if len(poly)<3:continue
            middle=(lo+hi)/2;sign=1 if middle>=0 else -1
            slope=(1.4 if front else .75) if abs(middle)<.10 else 0
            ceiling=(1.265 if front else 1.33) if slope else 1.405
            poly=clip(poly,lambda v:ceiling+slope*sign*v[0]-v[1])
            if abs(middle)>.155:poly=clip(poly,lambda v:1.405-(sign*v[0]-.155)*4-v[1])
            if len(poly)<3:continue
            corners=[corner(v) for v in poly]
            for j in range(1,len(corners)-1):faces.append(('body',[corners[0],corners[j],corners[j+1]]))
    mesh(name,verts,uvs,faces,ws,color,'top')

tailored_tank('tank',.009,[1,1,1,1])
fitted_shell('knit',knit_surface,.009,[.08,.08,.08,1])
fitted_shell('dressbodice',tank_surface,.020,[.3,.2,.15,1])
fitted_shell('tights',lambda p:.155<p[1]<.945,.0045,[.1,.1,.1,1])
def warmers(p):
    x,y,z=p;center=.085 if x>0 else -.085
    fold=1.10+.06*math.sin((y-.045)*math.pi*48)
    return [center+(x-center)*fold,y,z*fold]
fitted_shell('legwarmers',lambda p:.155<p[1]<.365,.012,[1,1,1,1],warmers)

def clothing(folder,name):
    path=SRC/folder/name
    verts,uvs,faces=obj(path/(name+'.obj'))
    bindings=[];reading=False;settings={}
    for line in (path/(name+'.mhclo')).read_text().splitlines():
        p=line.split()
        if not p or p[0].startswith('#'):continue
        if p[0] in ['x_scale','y_scale','z_scale']:settings[p[0]]=(int(p[1]),int(p[2]),float(p[3]))
        if p[0]=='verts':reading=True;continue
        if reading:
            if not p[0].lstrip('-').isdigit():
                if bindings:break
                continue
            if len(p)==1:bindings.append(([int(p[0])],[1.],[0,0,0]))
            elif len(p)>=9:bindings.append(([int(x) for x in p[:3]],[float(x) for x in p[3:6]],[float(x) for x in p[6:9]]))
    fitted=[];ws=[]
    scales=[]
    for axis,key in enumerate(['x_scale','y_scale','z_scale']):
        a,b,d=settings.get(key,(0,0,1));scales.append(abs(morphed[a][axis]-morphed[b][axis])/d if d and a!=b else 1)
    for i,(ids,bs,delta) in enumerate(bindings):
        fitted.append([sum(morphed[k][a]*w for k,w in zip(ids,bs))+delta[a]*scales[a] for a in range(3)])
        merged={}
        for k,w in zip(ids,bs):
            for b,val in weights[k].items():merged[b]=merged.get(b,0)+val*w
        ws.append(merged)
    if len(fitted)!=len(verts):raise ValueError(f'{name}: {len(fitted)} bindings != {len(verts)} verts')
    return fitted,uvs,faces,ws

# Original clothing meshes have disconnected top and bottom islands. Split by
# each island's max height, never cut triangles across the waist.
def split_clothes(faces,verts):
    parents=list(range(len(verts)))
    def root(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    for _,f in faces:
        for i,_ in f:parents[root(i)]=root(f[0][0])
    high={}
    for i,v in enumerate(verts):high[root(i)]=max(high.get(root(i),-100),world(v)[1])
    top=[f for f in faces if high[root(f[1][0][0])]>1.25]
    bottom=[f for f in faces if high[root(f[1][0][0])]<=1.25]
    return top,bottom

for asset,topname,bottomname in [('female_casualsuit01','top','trousers'),('female_casualsuit02','blouse','shorts'),('female_elegantsuit01','jacket','midiskirt')]:
    v,uv,f,w=clothing('clothes',asset);top,bottom=split_clothes(f,v)
    mesh(topname,v,uv,top,w,[.95,.87,.86,1],'top')
    if bottomname!='shorts':mesh(bottomname,v,uv,bottom,w,[.28,.22,.3,1],'bottom')
    if asset=='female_elegantsuit01':
        # The casualsuit02 bottom is shorts. Derive a genuine short skirt from
        # the elegant skirt's closed ring topology, preserving its UVs/weights.
        short=[p[:] for p in v]
        for p in short:
            yy=world(p)[1]
            if yy<.947:p[1]=(.69+(yy-.52)*(.947-.69)/(.947-.52))/scale+floor
        mesh('miniskirt',short,uv,bottom,w,[.5,.4,.4,1],'bottom')
for folder,asset,name,category in [('hair','ponytail01','hair','hair'),('eyes','high-poly','eyes','eyes'),('eyebrows','eyebrow001','eyebrows','hair'),('eyelashes','eyelashes01','eyelashes','hair'),('clothes','shoes01','shoes','shoes')]:
    v,uv,f,w=clothing(folder,asset)
    mesh(name,v,uv,f,w,[1,1,1,1],category)

matrices=[]
for name in names:
    x,y,z=heads[name];matrices.extend([1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1])
inverse=accessor(matrices,5126,'MAT4',16)
roots=[bindex[n] for n,b in rig['bones'].items() if not b.get('parent')]
scene=roots+list(range(len(names),len(nodes)))
gltf={'asset':{'version':'2.0','generator':'DTI2IRL offline MakeHuman CC0 packager'},'scene':0,'scenes':[{'nodes':scene}], 'nodes':nodes,'meshes':meshes,'materials':materials,'skins':[{'joints':list(range(len(names))),'inverseBindMatrices':inverse,'skeleton':bindex['root']}],'buffers':[{'byteLength':len(buffers)}],'bufferViews':views,'accessors':accessors,'extras':{'license':'CC0-1.0','makehumanCommit':'a8bc2d54ff0ac92e78ff71431b1023eda42bf482','boneCount':len(names)}}
js=json.dumps(gltf,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
buffers.extend(b'\0'*((-len(buffers))%4))
blob=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(buffers))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(buffers),0x004e4942)+buffers
(OUT/'studio.glb').write_bytes(blob)
# Keep originals for reproducibility; produce browser-optimized textures locally.
textures={'skin.jpg':('skins/young_caucasian_female/young_lightskinned_female_diffuse.png',2048),'hair.png':('hair/ponytail01/ponytail01_diffuse.png',1024),'eyes.png':('eyes/materials/brown_eye.png',512),'brows.png':('eyebrows/eyebrow001/eyebrow001.png',512),'lashes.png':('eyelashes/eyelashes01/eyelashes01.png',512)}
(OUT/'textures').mkdir(exist_ok=True)
for target,(source,size) in textures.items():
    code="import sharp from 'sharp'; await sharp(process.argv[1]).resize({width:Number(process.argv[3]),withoutEnlargement:true}).toFile(process.argv[2]);"
    subprocess.run(['node','--input-type=module','-e',code,str(SRC/source),str(OUT/'textures'/target),str(size)],cwd=ROOT,check=True)
wasm=OUT/'wasm';wasm.mkdir(exist_ok=True)
for f in (ROOT/'node_modules/@mediapipe/tasks-vision/wasm').iterdir():
    if f.suffix in ['.js','.wasm'] and '_module_' not in f.name:shutil.copyfile(f,wasm/f.name)
shutil.copyfile(ROOT/'node_modules/@mediapipe/tasks-vision/vision_bundle.js',OUT/'vision_bundle.js')
files={str(p.relative_to(OUT)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='SOURCES.json'}
manifest={'makehumanCommit':'a8bc2d54ff0ac92e78ff71431b1023eda42bf482','makehumanUrl':'https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482','systemPackUrl':'https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip','systemPackSha256':'b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107','mediapipeVersion':json.loads((ROOT/'node_modules/@mediapipe/tasks-vision/package.json').read_text())['version'],'faceModelUrl':'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task','poseModelUrl':'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task','boneCount':len(names),'meshes':[m['name'] for m in meshes],'files':files}
(OUT/'SOURCES.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Packaged',len(blob),'byte GLB;',len(names),'bones;',len(meshes),'meshes;',len(files),'checksummed local files')
