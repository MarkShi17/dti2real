import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
const path = '.env.local';
let content = await readFile(path, 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
const env = parseEnv(content), token = env.SEGMENTATION_TOKEN || randomBytes(32).toString('hex');
function set(key, value) {
  const line = `${key}=${value}`;
  content = new RegExp(`^${key}=.*$`, 'm').test(content) ? content.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${content.trimEnd()}\n${line}\n`;
}
set('SEGMENTATION_TOKEN', token);
if (!env.SEGMENTATION_URL) set('SEGMENTATION_URL', 'http://segmentation:8000');
await writeFile(path, content, { mode: 0o600 }); await chmod(path, 0o600);
await writeFile('.env.segmentation', `SEGMENTATION_TOKEN=${token}\n`, { mode: 0o600 }); await chmod('.env.segmentation', 0o600);
console.log('SAM worker credentials configured. Existing vision/shopping settings preserved.');
console.log('Start: docker compose --profile segmentation up --build -d');
