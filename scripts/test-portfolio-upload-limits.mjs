import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const source = await readFile(new URL('../supabase/functions/portfolio-media-sign/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*\n/, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const MB = 1024 * 1024;
async function sign({ premium = false, count = 0, size, original = size, resourceType = 'image' }) {
  let handler;
  let reservations = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    rpc: async (name) => {
      if (name === 'get_my_subscription_media_policy') return { data: [{ max_image_upload_mb: premium ? 5 : 3 }] };
      if (name === 'get_my_subscription_access') return { data: [{ has_access: true, plan_name: premium ? 'Premium' : 'Free' }] };
      if (name === 'require_vendor_feature_access') return { data: true };
      if (name === 'reserve_photo_upload_slot') { reservations++; return { data: [{ reservation_id: 'slot' }] }; }
      throw new Error(`Unexpected RPC ${name}`);
    },
    from: (table) => {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: table === 'vendors' ? { id: 'vendor' } : { id: 'album', media_count: count } }),
        then: (resolve, reject) => Promise.resolve({ count }).then(resolve, reject),
      };
      return chain;
    },
  };
  vm.runInNewContext(compiled, {
    createClient: () => client, crypto: webcrypto, TextEncoder, Response,
    Deno: { env: { get: () => 'test-setting' }, serve: (fn) => { handler = fn; } },
  });
  const response = await handler(new Request('https://test/upload', {
    method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ vendorId: 'vendor', albumId: 'album', mimeType: 'image/jpeg', resourceType, fileSize: size, originalFileSize: original }),
  }));
  return { status: response.status, body: await response.json(), reservations };
}
for (const premium of [false, true]) {
  const cap = premium ? 5 : 3;
  const albumCap = premium ? 10 : 5;
  const allowed = await sign({ premium, size: cap * MB, count: albumCap - 1 });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.remainingCapacity, 1);
  assert.equal(allowed.reservations, 1);
  for (const scenario of [
    { size: cap * MB + 1 },
    { size: 1, original: cap * MB + 1 },
    { size: 1, count: albumCap },
    { size: 1, resourceType: 'video' },
    { size: 0 },
  ]) {
    const denied = await sign({ premium, ...scenario });
    assert.equal(denied.status, 400, JSON.stringify(scenario));
    assert.equal(denied.reservations, 0, 'Rejected requests must not reserve quota');
  }
}
console.log('Portfolio signer: Free/Premium exact size boundaries, oversized originals, album caps and video rejection passed.');
