export async function api<T>(path: string, payload?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api/${path}`, { method, headers: payload instanceof FormData || payload === undefined ? undefined : { 'Content-Type': 'application/json' }, body: payload instanceof FormData ? payload : payload === undefined ? undefined : JSON.stringify(payload), cache: 'no-store' });
  let data; try { data = await response.json(); } catch { throw new Error('The server did not return a response. Retry the request.'); }
  if (!response.ok) throw new Error(data.error || 'The request failed. Please retry.');
  return data as T;
}
