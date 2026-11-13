import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../supabase/functions/verify-booking-payment/index.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source.replace(/^import\s*\{[\s\S]*?\}\s*from\s*"[^"\n]+";/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
let handler;
let databaseCalls = 0;
let finalizeCalls = 0;
let gatewayCalls = 0;
const booking = { id: '11111111-1111-4111-8111-111111111111', booking_id: 'BK1', customer_id: 'customer1', razorpay_order_id: 'order_example', booking_status: 'pending_payment', payment_status: 'pending', booking_fee_amount: 1 };
const query = { select() { return this; }, eq() { return this; }, or() { return this; }, async maybeSingle() { return { data: booking, error: null }; } };
vm.runInNewContext(code, {
  Deno: { serve(fn) { handler = fn; } }, console, Request, Response,
  corsHeaders: {}, json: (data, status = 200) => Response.json(data, { status }),
  errorMessage: (error, fallback) => error?.message || fallback,
  serviceClient() { databaseCalls++; return { from() { return query; }, async rpc() { finalizeCalls++; return { data: { success: true }, error: null }; } }; },
  resolveCallerUser: async () => ({ user: { id: 'customer1' }, isServiceRole: false }),
  razorpayAuthorization: () => ({ keyId: 'rzp_live_Example', keySecret: 'fake-secret', header: 'Basic fake' }),
  hmacHex: async () => 'expected-signature', constantTimeEqual: (a, b) => a === b,
  fetch: async () => { gatewayCalls++; return Response.json({ id: 'pay_example', order_id: 'order_example', status: 'captured', amount: 100, currency: 'INR', method: 'upi' }); },
});
const send = body => handler(new Request('https://example.invalid', { method: 'POST', body }));
for (const body of ['{', 'null', '[]', '{}']) assert.equal((await send(body)).status, 400);
assert.equal(databaseCalls, 0, 'invalid input must not access the database');
const input = { bookingId: 'BK1', razorpayOrderId: 'order_example', razorpayPaymentId: 'pay_example', razorpaySignature: 'forged' };
assert.equal((await send(JSON.stringify(input))).status, 400);
assert.equal(gatewayCalls, 0, 'invalid signature must not call Razorpay');
assert.equal(finalizeCalls, 0);
const response = await send(JSON.stringify({ ...input, razorpaySignature: 'expected-signature' }));
assert.equal(response.status, 200);
assert.equal((await response.json()).success, true);
assert.equal(finalizeCalls, 1);
assert.equal(gatewayCalls, 1);
console.log('Booking payment handler passed: malformed bodies, parsed booking input, signature rejection and captured-payment finalization (mocked provider/database).');
