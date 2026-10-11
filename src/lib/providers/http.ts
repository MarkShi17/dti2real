import { AppError } from '../security';
export async function providerJson(url: string, init: RequestInit = {}, timeout = 30000, retries = 1): Promise<unknown> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout), redirect: 'error', cache: 'no-store' });
      if ((response.status === 429 || response.status >= 500) && attempt < retries) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
      if (!response.ok) throw new AppError(`Provider returned HTTP ${response.status}. Check credentials, quota and provider status, then retry.`, 502);
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
