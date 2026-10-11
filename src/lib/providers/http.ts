import { AppError } from '../security';
async function imageRejection(response: Response, init: RequestInit): Promise<string | undefined> {
  try {
    const body = await response.text();
    if (body.length > 16000) return;
    const error = JSON.parse(body)?.error;
    if (!error || typeof error.message !== 'string') return;
    const code = typeof error.code === 'string' && /^[a-z0-9_-]{1,80}$/i.test(error.code) ? error.code : undefined;
    if (code === 'moderation_blocked') {
      const filter = /safety_violations=\[sexual\]/i.test(error.message) ? 'sexual-content filter' : 'content filter';
      return `Sunburst blocked this outfit generation under its ${filter} (HTTP ${response.status}). Your previous preview is preserved. Choose a different product photo or listing and try again.`;
    }
    const token = new Headers(init.headers).get('Authorization')?.replace(/^Bearer\s+/i, '');
    let message = error.message;
    if (token) message = message.split(token).join('[redacted]');
    message = message.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').replace(/data:image\/[^\s"']+/g, '[image]').replace(/[\r\n]+/g, ' ').slice(0, 600);
    return `Sunburst returned HTTP ${response.status}${code ? ` (${code})` : ''}: ${message}`;
  } catch { return; }
}
export async function providerJson(url: string, init: RequestInit = {}, timeout = 30000, retries = 1): Promise<unknown> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout), redirect: 'error', cache: 'no-store' });
      if ((response.status === 429 || response.status >= 500) && attempt < retries) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
      if (!response.ok) {
        const imageEdit = url === 'https://api.openai.com/v1/images/edits';
        const reason = imageEdit ? await imageRejection(response, init) : undefined;
        throw new AppError(reason || `Provider returned HTTP ${response.status}. Check credentials, quota and provider status, then retry.`, 502);
      }
      const text = await response.text(); if (text.length > 20_000_000) throw new AppError('Provider response is too large.', 502);
      try { return JSON.parse(text); } catch { throw new AppError('Provider returned malformed JSON.', 502); }
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (attempt < retries) continue;
      throw new AppError('Provider connection failed or timed out. Please retry.', 504);
    }
  }
  throw new AppError('Provider unavailable.', 502);
}
