# Clothing-free local pose guides

These 768 × 1024 PNGs are neutral stick figures on a white background. They contain no photograph pixels, garment textures, hair, skin, or identifying facial detail. Their 33 joint coordinates were detected locally from the bundled fictional studio references in `public/demo/base-{pose}.webp`.

Detection used the bundled MediaPipe Tasks Vision 1.1.0 PoseLandmarker Lite float16 model, version 1, in a browser Web Worker with the CPU delegate. All JS, WASM and model files were loaded from localhost; no external inference service was called. Pose model SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`. Original MakeHuman/MediaPipe sources and licenses are documented in [../README.md](../README.md). These guides are newly drawn vector-style artwork derived from landmark coordinates, rather than edited or recolored photographs.

Rendering preserves the reference image aspect ratio and fits recognized body joints into a 600 × 856 pixel area centered on the 768 × 1024 canvas. Standard `PoseLandmarker.POSE_CONNECTIONS` join shoulders, elbows, wrists, pelvis, knees, ankles, heels and toes. A neutral outlined head and wrist circles replace photographic details; the head direction marker follows the detected nose. The peace guide adds an explicit two-finger V because the 33-point body model does not recover individual finger joints.

These guides communicate approximate posture only. Occluded joints and depth remain estimates from a single photograph, particularly in the three-quarter back pose. They do not encode clothing, exact anatomy, facial identity, or garment fit.

| Pose | Source dimensions | Lowest limb visibility | Source SHA-256 | Guide SHA-256 |
| --- | --- | --- | --- | --- |
| runway | 640 × 1068 | 0.963 | `6ce6776a1fe96a1d35820e55c1137db82bbf36409f9ad71b2a4c91d23072293a` | `d87b2b17e6d1cd7c37fbfc5d11d4010ff059770dd853e6357091d8be2d8a3201` |
| hip | 640 × 1068 | 0.951 | `4f0238a3cdd2f9ae6295ce7a471047cca7a8bf2161bde95239ebe55218e23392` | `8dbaf7d7cf1b678832cce98579600ef1be0d519460787cb59dd421918030250c` |
| peace | 640 × 1068 | 0.959 | `f24e981592978580e99964b9cc5fbe746460cb2c82b1271c89df6f7512abe38c` | `a95760bbe28a28965ac1b1c58eeb7ebed26ba3eb29863eca8ecc253cd521a306` |
| shoulder | 640 × 1068 | 0.093 | `81cef051d0583b14e3109353e6eff04604ea07f4ec66f1459781b85a84af4043` | `b261dd6ce6c23ea03f9d0c3372a24d23de64083a7e7517dde069e096f56447c1` |
| lean | 640 × 1068 | 0.824 | `65073d4a44710752a99ab0134656d435134a33b60f3cc9191a216f5664f59f35` | `1c0b427430508339b01d18e36c6b6b172d56c1f66514620bf5b4c59d189b6649` |

Reproduction: load the local PoseLandmarker with `runningMode: IMAGE`, `numPoses: 1`, `delegate: CPU` and `minPoseDetectionConfidence: 0.4`; detect each source bitmap, draw the normalized coordinates using the framing and edges above on an empty white canvas, then export PNG. No source bitmap is drawn onto the output canvas.

Reproduce with a running local application: `POSE_GUIDES_BASE_URL=http://127.0.0.1:3212 node scripts/package-pose-guides.mjs`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only when using a separately installed Chromium. The generator runs the bundled CPU pose model, then draws vector joints on a blank canvas; no source photograph pixels are copied.
