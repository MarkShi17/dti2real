import { afterEach,expect,it,vi } from 'vitest';
import { clientId } from '@/lib/client-id';
afterEach(()=>vi.unstubAllGlobals());
it('creates distinct UUIDv4 identifiers without the secure-context randomUUID API',()=>{
 const original=crypto;vi.stubGlobal('crypto',{getRandomValues:original.getRandomValues.bind(original)});
 const first=clientId(),second=clientId();expect(first).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);expect(second).not.toBe(first);
});
