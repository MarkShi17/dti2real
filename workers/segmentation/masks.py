"""Mask quality gates are heuristics, not calibrated accuracy measurements."""
import numpy as np
from scipy import ndimage

def choose_mask(masks, scores, box):
    h,w=masks.shape[-2:]
    x0,y0,x1,y1=box
    left=max(0,int(x0-w*.02)); right=min(w,int(x1+w*.02+1))
    top=max(0,int(y0-h*.02)); bottom=min(h,int(y1+h*.02+1))
    for i in np.argsort(scores)[::-1]:
        score=float(scores[i])
        if not np.isfinite(score) or score<.8:
            continue
        mask=masks[i].astype(bool).copy()
        area=int(mask.sum())
        if area<16 or area>w*h*.9:
            continue
        labels,count=ndimage.label(mask)
        sizes=np.bincount(labels.ravel())
        keep=sizes>=max(16,area*.005);keep[0]=False
        mask=keep[labels]
        area=int(mask.sum())
        if area<16 or mask[top:bottom,left:right].sum()/area<.9:
            continue
        return mask,min(1.,score)
    return None


def prompt_boxes(box, width, height, category):
    original=np.array(box,dtype=float)
    boxes=[original]
    if category=='jewelry': return boxes
    bw,bh=original[2]-original[0],original[3]-original[1]
    # VLM coordinates are approximate. Try bounded relative shifts without re-encoding the image.
    for dy in [-.1,0,.1]:
        for dx in [-.2,0,.2]:
            if dx==0 and dy==0: continue
            candidate=original+np.array([dx*bw,dy*bh,dx*bw,dy*bh])
            boxes.append(np.clip(candidate,0,[width,height,width,height]))
    return boxes
