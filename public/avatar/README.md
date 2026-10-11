# Bundled 3D avatar assets

The fictional adult studio body is a real MakeHuman mesh with its original
163-bone rig and skin weights, including face bones and three joints per finger.
The mesh is not an image billboard or a primitive mannequin.

## Sources and licenses

- **MakeHuman body, skeleton, weights and adult morph targets:**
  https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482
  Pinned commit `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`. CC0-1.0;
  original copyright holders Data Collection AB, Joel Palmius and Jonas Hauquier.
  The original full CC0 license is preserved in `source/LICENSE-MAKEHUMAN.md`.
- **MakeHuman system skin, hair, eyes, eyebrows, eyelashes and garments:**
  https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
  Official pack https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
  SHA-256 `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`.
  All selected assets are listed as CC0 in that catalog, and retain their original
  author/license headers in the `.mhclo`/`.mhmat` sources.
- **MediaPipe Tasks Vision 1.1.0 JS and WASM:** installed npm package
  `@mediapipe/tasks-vision`, Apache-2.0. License copied to `LICENSE-MEDIAPIPE.txt`.
- **MediaPipe face and pose models:** official Google-hosted version 1 assets,
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
  MediaPipe project licensing: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
  Model cards: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
  and https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker.

`SOURCES.json` records source URLs, pins, model versions and SHA-256 checksums for
all bundled sources, runtime files and generated assets. No runtime CDN is used.
Only files needed by rendering and analysis are requested in the browser; raw
source assets remain available for reproducible packaging.

## Rebuild

Run `python3 scripts/package-avatar.py` from the repository after installing npm
dependencies. This is an offline converter; it reads the included original OBJ,
MHCLO bindings, MHSKEL joints, MHW weights, and adult morph targets. It emits the
GLB with normalized four-influence skin weights, shared joints, smooth vertex
normals, UVs and fitted clothing; optimizes skin/hair/eye textures using installed
Sharp; and copies local MediaPipe JS/WASM. It does not require Blender or a GUI.
Top/bottom garment islands are split without cutting faces. Raw MakeHuman helper
surfaces are excluded from the displayed body.

## Scope and limitations

Photo landmarks and silhouette initialize adjustable ratios; the browser worker
never sends uploaded pixels to Google or any other service. Facial detail uses
the original private face photo projected onto the rigged face with soft edges.
Sixteen eye, nose, lip, cheek, jaw and chin landmarks drive smooth, bounded
geometry adjustments on the original curved face, eyes, eyebrows and eyelashes;
the same anchors align the photo texture to those features. Geometry offsets are
limited to 11 mm, preserving the base topology, curved depth and skin weights.
This is a best-effort
likeness from a single view, not a recovered scan or biometric identity model.
Clothes use fitted templates with separate tank straps, long sleeves, pinafore
bodices, skirt lengths, tights and calf warmers. Derived shells retain the real
body's joints and weights; hand-weighted vertices are excluded from sleeves and
stockings. Selected product photos are fetched through the current session's
validated image endpoint and cropped locally using pose landmarks or foreground
bounds. Their original pixels are bounded to garment fronts; back/sleeve surfaces
use a fabric sample. Background and model-skin removal is approximate; packaging
is sampled/tinted as material rather than printed onto stockings. Failed selected
photo fetches show a visible notice and approximate color, without substituting
the inspiration screenshot. With no selected product, an available inspiration
crop can supply a reference. Product photos and face images are never bundled in
this public asset directory.

Templates do not predict precise size or fit, reproduce tailoring, or simulate
fabric drape. Body-derived necklines can show polygon edges and tight contouring.
Multiple pieces needing the same template layer produce a visible notice naming
the omitted piece. Orbit rendering coalesces into animation frames, stops when
idle, and rebuilds outfits only when their data changes.
Hair, unseen features, and body areas covered by the reference remain fictional.
