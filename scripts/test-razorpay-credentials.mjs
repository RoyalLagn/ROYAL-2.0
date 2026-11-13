import assert from 'node:assert/strict';
import { resolveRazorpayCredentials } from '../supabase/functions/_shared/razorpayCredentials.ts';

const resolve = (env) => resolveRazorpayCredentials(name => env[name]);
const requested = [];
assert.deepEqual(resolveRazorpayCredentials(name => {
  requested.push(name);
  return { RAZORPAY_KEY_ID: 'rzp_live_Example123', RAZORPAY_KEY_SECRET: 'fake-secret' }[name];
}), { keyId: 'rzp_live_Example123', keySecret: 'fake-secret' });
assert.deepEqual(requested, ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']);
assert.throws(() => resolve({ RAZORPAY_KEY_ID: 'rzp_live_Example123' }), /RAZORPAY_KEY_SECRET is not configured/);
assert.throws(() => resolve({ RAZORPAY_KEY_SECRET: 'fake-secret' }), /RAZORPAY_KEY_ID is not configured/);
assert.throws(() => resolve({}), /not configured/);
for (const id of ['rzp_test_Example123', 'rzp_live_', 'rzp_live_Example!23', 'not-a-key']) {
  assert.throws(() => resolve({ RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: 'fake-secret' }), /must be a valid Razorpay live key ID/);
}
assert.deepEqual(resolve({ RAZORPAY_KEY_ID: ' rzp_live_Example123 ', RAZORPAY_KEY_SECRET: ' fake-secret ' }), { keyId: 'rzp_live_Example123', keySecret: 'fake-secret' });
console.log('Razorpay credential tests passed: live-only keys, rejected test keys, missing pairs, environment reads and validation.');
