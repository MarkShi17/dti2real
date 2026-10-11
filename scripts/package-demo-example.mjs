#!/usr/bin/env node
import sharp from 'sharp';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'public/demo/fitexample-v1');
await mkdir(resolve(directory, 'products'), { recursive: true });
const files = {};
async function packageImage(input, target, width) {
  const image = sharp(input).rotate();
  if (width) image.resize({ width, withoutEnlargement: true });
  const output = resolve(directory, target);
  await image.webp({ quality: 94, effort: 6 }).toFile(output);
  const bytes = await readFile(output), metadata = await sharp(bytes).metadata();
  files[target] = { width: metadata.width, height: metadata.height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await packageImage(resolve(root, 'docs/dti_example/fitEXAMPLE.png'), 'source.webp');
for (const pose of ['runway', 'hip', 'peace', 'shoulder', 'lean']) {
  await packageImage(resolve(directory, `${pose}-master.png`), `${pose}.webp`);
  await packageImage(resolve(directory, `before-${pose}-master.png`), `before-${pose}.webp`);
}
for (const category of ['top', 'bottom', 'bag', 'shoes']) await packageImage(resolve(directory, `${category}-master.png`), `products/${category}.webp`, 768);
await writeFile(resolve(directory, 'SOURCES.json'), JSON.stringify({ id: 'fitexample-v1', source: 'docs/dti_example/fitEXAMPLE.png', tool: 'built-in image_gen', assets: 'Fictional adult and illustrative clothing samples; pre-generated locally, no runtime inference.', files }, null, 2) + '\n');
console.log(`Packaged ${Object.keys(files).length} example assets; portrait resolution retained.`);
