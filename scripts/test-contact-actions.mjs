import assert from "node:assert/strict";
import { buildVendorProfilePath, normalizeWhatsAppPhone } from "../services/contactActions.ts";

assert.equal(normalizeWhatsAppPhone("98765 43210"), "919876543210");
assert.equal(normalizeWhatsAppPhone("09876543210"), "919876543210");
assert.equal(normalizeWhatsAppPhone("+91 98765 43210"), "919876543210");
assert.equal(normalizeWhatsAppPhone("+1 (415) 555-2671"), "14155552671");
assert.equal(normalizeWhatsAppPhone(""), "");

assert.equal(
  buildVendorProfilePath("vendor-id", "Wedding DJs"),
  "/VendorsProfile?vendorId=vendor-id&category=Wedding%20DJs",
);
assert.equal(
  buildVendorProfilePath("vendor/id", null),
  "/VendorsProfile?vendorId=vendor%2Fid",
);

console.log("contact action tests passed");
