import assert from 'node:assert/strict';
import { resolveRazorpayCredentials } from '../supabase/functions/_shared/razorpayCredentials.ts';

const resolve = (env) => resolveRazorpayCredentials(name => env[name]);
const legacy = { RAZORPAY_TEST_KEY_ID: 'rzp_test_Legacy123', RAZORPAY_TEST_KEY_SECRET: 'fake-test-secret' };
assert.deepEqual(resolve(legacy), { keyId: legacy.RAZORPAY_TEST_KEY_ID, keySecret: legacy.RAZORPAY_TEST_KEY_SECRET });
for (const mode of ['test', 'live']) {
  const env = { ...legacy, RAZORPAY_KEY_ID: `rzp_${mode}_Example123`, RAZORPAY_KEY_SECRET: 'fake-new-secret' };
  assert.deepEqual(resolve(env), { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET });
}
assert.throws(() => resolve({ ...legacy, RAZORPAY_KEY_ID: 'rzp_live_Example123' }), /RAZORPAY_KEY_SECRET is not configured/);
assert.throws(() => resolve({ ...legacy, RAZORPAY_KEY_SECRET: 'fake-secret' }), /RAZORPAY_KEY_ID is not configured/);
assert.throws(() => resolve({}), /not configured/);
assert.throws(() => resolve({ ...legacy, RAZORPAY_TEST_KEY_ID: 'rzp_live_Example123' }), /not a valid/);
for (const id of ['rzp_live_', 'rzp_live_Example!23', 'not-a-key']) {
  assert.throws(() => resolve({ RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: 'fake-secret' }), /not a valid/);
}
assert.deepEqual(resolve({ RAZORPAY_KEY_ID: ' rzp_live_Example123 ', RAZORPAY_KEY_SECRET: ' fake-secret ' }), { keyId: 'rzp_live_Example123', keySecret: 'fake-secret' });
console.log('Razorpay credential tests passed: live/test, precedence, incomplete pairs, legacy safety and validation.');
