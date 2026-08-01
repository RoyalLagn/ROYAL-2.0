import assert from "node:assert/strict";
import { validateVendorPackage } from "../packages/validation.ts";

const base = {
  title: "Signature Wedding",
  price_type: "fixed",
  price: 50000,
  discounted_price: 45000,
  events_covered: 2,
  items: [{ item_type: "included", title: "Full-day coverage" }],
};

assert.deepEqual(validateVendorPackage(base), []);
assert.deepEqual(validateVendorPackage({ ...base, price_type: "contact", price: null, discounted_price: null }), []);
assert.match(validateVendorPackage({ ...base, discounted_price: 60000 })[0], /Offer price/);
assert.match(validateVendorPackage({ ...base, events_covered: 0 })[0], /Events covered/);
assert.match(validateVendorPackage({ ...base, items: [{ item_type: "included", title: "" }] })[0], /requires a name/);
assert.match(validateVendorPackage({ ...base, items: [{ item_type: "add_on", title: "Drone", price: -1 }] })[0], /Add-on prices/);

console.log("package domain tests passed");
