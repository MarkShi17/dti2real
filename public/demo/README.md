# Demo image provenance

These are original synthetic assets created for DTI2IRL during implementation using the available OpenAI image-generation tool. They are not photographs of a real customer or retailer listings. No product brand or endorsement is implied.

- `wardrobe-contact-sheet.png`: successfully generated contact sheet of one fictional adult (approximately age 30), black opaque high-neck knit, silver pleated maxi skirt and black ankle boots in five distinct poses. Second row changes the skirt to burgundy.
- `base-contact-sheet.png`: same fictional adult, plain white T-shirt and blue jeans, five distinct full-body poses. These serve as studio identity/pose references.
- `sample-source.png`: original synthetic, blocky game-style fashion avatar matching the silver outfit, with bag and pendant. It is a created example, not a captured Roblox screenshot.
- Individual WebP files are deterministic crops/resizes of those outputs. Product thumbnails are detail crops or generic category icons, never live packshots.

Pose brief: neutral runway, hand on hip, peace sign, over the shoulder, dramatic lean. Studio brief: photorealistic editorial fashion photography, full body including head and feet, soft neutral background, consistent adult identity and clothing, no text or logos. All source contact sheets were inspected before packaging; pose images are separate outputs, not CSS transforms of one photo.

`node scripts/package-assets.mjs` rebuilds the pose files and primary clothing crops from the checked-in source sheets. Bag/jewelry detail crops and category fallback icons are also checked in. Source PNGs are excluded from the production Docker image to reduce its size.

The app identifies these as “Sample preview”, “Pre-rendered”, “Demo listing”, and “Sample” prices. Only the two supported sample outfits should resolve to these renders. Personal images and other products must not be represented by these samples as if model inference succeeded.
