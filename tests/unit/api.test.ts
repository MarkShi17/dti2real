import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { sameOrigin } from '@/lib/api';
describe('Docker and reverse-proxy origin checks', () => {
  it('accepts the browser host when the internal container port differs', () => {
    const req = new NextRequest('http://0.0.0.0:3000/api/session', { method: 'POST', headers: { host: '127.0.0.1:3210', origin: 'http://127.0.0.1:3210', 'sec-fetch-site': 'same-origin' } });
    expect(() => sameOrigin(req)).not.toThrow();
  });
  it('rejects a foreign origin even with the right host header', () => {
    const req = new NextRequest('http://0.0.0.0:3000/api/session', { method: 'POST', headers: { host: '127.0.0.1:3210', origin: 'https://evil.example' } });
    expect(() => sameOrigin(req)).toThrow('Cross-origin');
  });
});
