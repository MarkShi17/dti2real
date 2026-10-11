import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const dir = 'public/demo';
await mkdir(`${dir}/products`, { recursive: true });
const poses = ['runway', 'hip', 'peace', 'shoulder', 'lean'];
for (const [source, rows, names] of [['wardrobe-contact-sheet.png', 2, ['silver', 'burgundy']], ['base-contact-sheet.png', 1, ['base']]]) {
  const meta = await sharp(`${dir}/${source}`).metadata();
  const w = Math.floor(meta.width / 5), h = Math.floor(meta.height / rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < 5; c++) {
    await sharp(`${dir}/${source}`).extract({ left: c * w, top: r * h, width: w, height: h }).resize({ width: 640 }).webp({ quality: 90 }).toFile(`${dir}/${names[r]}-${poses[c]}.webp`);
  }
}
await sharp(`${dir}/sample-source.png`).resize({ width: 900 }).webp({ quality: 90 }).toFile(`${dir}/sample.webp`);
// Honest detail crops from created sample photos, not retailer packshots.
for (const [name, source, box] of [
  ['top', 'silver', [.22, .15, .55, .23]],
  ['bottom', 'silver', [.2, .35, .6, .5]],
  ['bottom-burgundy', 'burgundy', [.2, .35, .6, .5]],
  ['shoes', 'silver', [.35, .84, .33, .13]],
]) {
  const file = `${dir}/${source}-runway.webp`, m = await sharp(file).metadata();
  await sharp(file).extract({ left: Math.round(box[0]*m.width), top: Math.round(box[1]*m.height), width: Math.floor(box[2]*m.width), height: Math.floor(box[3]*m.height) }).resize(440, 480, { fit: 'contain', background: '#dad6d0' }).webp({ quality: 90 }).toFile(`${dir}/products/${name}.webp`);
}
console.log('Packaged five poses × two outfits, five studio references, and sample image.');
