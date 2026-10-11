# fitEXAMPLE demo

Open `http://localhost:3212` and select **Explore an example**. The example uses
`docs/dti_example/fitEXAMPLE.png`: a green asymmetric sweater, navy wide-leg
trousers, a burgundy crossbody bag and taupe flats.

The fictional adult has warm tan skin and a dark chestnut centre-part bob.
Five separate editorial photographs preserve her identity and wardrobe:
runway, hand on hip, peace sign, over-the-shoulder and dramatic lean.
Each has a matching before photograph. Product packshots and prices are
illustrative; shopping links open searches for the corresponding clothing.

## Presentation timing

The first reveal and each replay take at least 15 seconds: 3 seconds for
annotations, two 2-second match batches and 8 seconds for the photo.
Regeneration takes at least 8 seconds; photo pose changes take at least
2.5 seconds. Asset preloading and server caching do not shorten these waits.
Changing the source or selection cancels pending presentation work.

The example runs without paid inference, even when live providers are
configured. Its authored photo and mesh apply only to the complete canonical
four-piece studio outfit. Edited outfits and personal photos cannot reuse
this fixture as if it were a newly generated result.

## Assets and reproduction

- Photos: `public/demo/fitexample-v1/`. The built-in image generation tool
  created the outfit photographs; image editing preserved pose and identity
  for the before photographs and isolated the products for packshots.
  `PROMPTS.json` preserves the before/product edit prompts. The outfit brief
  is a natural full-body editorial studio photograph of the fictional adult
  wearing the exact source outfit, with the specified pose, warm neutral
  seamless background, realistic skin/fabric/leather, full head and feet,
  and no text, logos or collage. Pose edits use the runway photograph as the
  identity/outfit reference.
- Full-resolution PNG masters are retained locally. Run
  `node scripts/package-demo-example.mjs` to produce quality-94 WebP files.
  Portraits retain 1024 × 1536 resolution; packshots resize to 768 px wide.
  Masters are excluded from the production Docker image.
- Mesh: `public/avatar/examples/fitexample-v1/avatar.glb`, built by
  `node scripts/package-example-avatar.mjs` from the existing CC0 MakeHuman
  derivative. Clothing uses rigged garment topology, a clipped asymmetric
  neckline, closed purse panels and curved head-weighted bob geometry.
  Screenshot pixels are not projected onto the body. Its interactive poses,
  orbit, zoom, proportion adjustments and PNG snapshot work locally.
- `src/lib/avatar/example-profile.json` stores MediaPipe landmarks actually
  detected from `before-runway.webp`; the face texture uses that photograph.
  Proportions default to the stable studio rig and remain adjustable.
- Each asset directory contains `SOURCES.json` with provenance and SHA-256
  checksums. The 3D preview approximates style; it does not measure fit.

## Verification

`tests/unit/example*.test.ts` cover fixture isolation, timing, cancellation,
skeletal weights, mesh density and anatomical masking.
`tests/e2e/example.spec.ts` covers the visible waits, five photo poses,
comparison, export, persistence, replay, interactive mesh and stale selections.
