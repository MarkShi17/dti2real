import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    return !(p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && [0, 168].includes(p[1])) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || (p[0] === 198 && [18, 19, 51].includes(p[1])) || (p[0] === 203 && p[1] === 0));
  }
  // Only global-unicast IPv6. Reject all mapped/compatible/transition ranges.
  if (isIP(ip) === 6) return /^[23]/i.test(ip) && !/^200[12]:/i.test(ip) && !/^2001:db8:/i.test(ip);
  return false;
}
export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4096) return;
  try {
    const u = new URL(value), host = u.hostname.replace(/^\[|\]$/g, '');
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return;
    if (!host.includes('.') && !isIP(host)) return;
    if (/\.(local|localhost|internal|test|invalid)$/i.test(host) || host === 'localhost' || (isIP(host) && !isPublicAddress(host))) return;
    return u.href;
  } catch { return; }
}
const imageHosts = ['gstatic.com', 'googleusercontent.com', 'ebayimg.com', 'media-assets.grailed.com', 'media-photos.depop.com', 'cdn.fashn.ai', 'fal.media', 'fashn.ai'];
export async function fetchImage(url: string): Promise<Buffer> {
  const valid = safeExternalUrl(url); if (!valid) throw new AppError('This image URL is not a public HTTPS address.');
  const u = new URL(valid);
  const allowed = [...imageHosts, ...(process.env.IMAGE_ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)];
  if (!allowed.some(host => u.hostname === host || u.hostname.endsWith(`.${host}`))) throw new AppError(`Image host ${u.hostname} is not enabled. Add this trusted retailer host to IMAGE_ALLOWED_HOSTS.`, 422);
  const addresses = await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new AppError('Image host resolves to a private or reserved network.');
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(u, { lookup: ((_hostname: string, _options: unknown, callback: (err: Error | null, address: string, family: number) => void) => callback(null, address.address, address.family)) as never, family: address.family, headers: { 'User-Agent': 'DTI2IRL/0.1', Accept: 'image/*' } }, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new AppError('The product image could not be downloaded. Redirects are not followed.', 502)); return; }
      if (!/^image\/(png|jpeg|webp|avif)(;|$)/i.test(res.headers['content-type'] || '')) { res.resume(); reject(new AppError('Provider returned an unsupported image type.', 502)); return; }
      let size = 0; const chunks: Buffer[] = [];
      res.on('data', chunk => { size += chunk.length; if (size > 12 * 1024 * 1024) req.destroy(new AppError('Image exceeds 12 MB.')); else chunks.push(chunk); });
      res.on('end', () => resolve(Buffer.concat(chunks))); res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new AppError('Image download timed out.', 504)), 20000);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject);
  });
}
