import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.env.DATA_DIR || join(process.cwd(), '.data');
let count = 0;
for (const id of await readdir(root).catch(() => [])) {
  if (!/^[a-f0-9-]{36}$/.test(id)) continue;
  try { const session = JSON.parse(await readFile(join(root, id, 'session.json'), 'utf8')); if (Date.now() - session.createdAt > 86400000) { await rm(join(root, id), { recursive: true, force: true }); count++; } } catch { /* Skip active/incomplete sessions. */ }
}
console.log(`Removed ${count} expired sessions.`);
