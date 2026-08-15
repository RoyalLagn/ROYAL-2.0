import assert from "node:assert/strict";
import { safeInternalTarget } from "../utils/safeNavigation.ts";

const routes = new Set(["/VendorsListing", "/VendorEnquiries"]);

assert.deepEqual(
  safeInternalTarget("/VendorsListing?category=Bridal%20Wear&sort=rating", routes),
  {
    pathname: "/VendorsListing",
    params: { category: "Bridal Wear", sort: "rating" },
  },
);
assert.deepEqual(
  safeInternalTarget("  /VendorEnquiries  ", routes),
  { pathname: "/VendorEnquiries" },
);
assert.equal(safeInternalTarget("https://example.com", routes), null);
assert.equal(safeInternalTarget("//example.com/VendorEnquiries", routes), null);
assert.equal(safeInternalTarget("/AdminLogin", routes), null);
assert.equal(safeInternalTarget("", routes), null);
assert.equal(safeInternalTarget(null, routes), null);

console.log("safe navigation tests passed");
