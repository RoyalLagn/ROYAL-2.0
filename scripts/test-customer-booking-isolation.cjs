const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the production service with isolated auth, storage and query adapters.
let user = null;
let authError = null;
let queried = 0;
let storageReads = 0;
let filters = [];
let remoteError = false;
const cached = [
  { id: 'a', customer_id: 'alice', created_at: '2026-11-01' },
  { id: 'b', customer_id: 'bob', customer_phone: '123', created_at: '2026-11-02' },
  { id: 'guest', customer_id: null, customer_phone: '123', created_at: '2026-11-03' },
];
const client = {
  auth: { getUser: async () => ({ data: { user }, error: authError }) },
  from: () => {
    queried++;
    return {
      select() { return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      async order() { if (remoteError) throw new Error('offline'); return { data: [], error: null }; },
    };
  },
};
const moduleStub = { exports: {} };
const source = ts.transpileModule(fs.readFileSync('services/vendorBookings.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
vm.runInNewContext(source, {
  module: moduleStub, exports: moduleStub.exports, console,
  require(name) {
    if (name === '@/services/supabase') return { supabase: client };
    if (name === '@react-native-async-storage/async-storage') return {
      getItem: async () => { storageReads++; return JSON.stringify(cached); },
    };
    return {};
  },
});
const service = moduleStub.exports.VendorBookingService;
(async () => {
  assert.equal((await service.getCustomerBookings()).length, 0);
  assert.equal(queried, 0);
  assert.equal(storageReads, 0);
  assert.equal((await service.getCustomerBookings('alice')).length, 0);
  user = { id: 'bob' };
  assert.equal((await service.getCustomerBookings('alice')).length, 0);
  assert.equal(queried, 0);
  user = { id: 'alice' };
  let result = await service.getCustomerBookings('alice');
  assert.deepEqual(Array.from(result, b => b.id), ['a']);
  assert.deepEqual(filters, [['customer_id', 'alice']]);
  user = { id: 'bob' };
  result = await service.getCustomerBookings('bob');
  assert.deepEqual(Array.from(result, b => b.id), ['b']);
  remoteError = true;
  assert.deepEqual(Array.from(await service.getCustomerBookings('bob'), b => b.id), ['b']);
  user = null;
  assert.equal((await service.getCustomerBookings('bob')).length, 0);
  authError = new Error('expired');
  user = { id: 'alice' };
  assert.equal((await service.getCustomerBookings('alice')).length, 0);
  console.log('PASS: guest, logout, expired auth, owner mismatch, account switch and isolated cache fallback');
})().catch(error => { console.error(error); process.exitCode = 1; });
