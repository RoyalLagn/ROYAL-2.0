import assert from "node:assert/strict";
import {
  findSupportedSelection,
  formatLocationPreference,
  formatCanonicalVendorLocation,
  getVendorProximity,
  rankVendorsByLocation,
  rankVendorsByLocationAndMembership,
  vendorNearbyLabel,
} from "../locations/domain.ts";

const cities = [{
  id: "pune",
  name: "Pune",
  state: "Maharashtra",
  slug: "pune-maharashtra",
  isActive: true,
  displayOrder: 10,
  areas: [
    { id: "baner", cityId: "pune", name: "Baner", slug: "baner", isActive: true, displayOrder: 10 },
    { id: "old-area", cityId: "pune", name: "Old Area", slug: "old-area", isActive: false, displayOrder: 20 },
  ],
}, {
  id: "mumbai",
  name: "Mumbai",
  state: "Maharashtra",
  slug: "mumbai-maharashtra",
  isActive: true,
  displayOrder: 20,
  areas: [],
}];

const preference = { cityId: "pune", areaId: "baner", pincode: "411045" };
const vendors = [
  { id: "other", serviceLocations: [{ cityId: "mumbai", areaId: null, pincode: null }] },
  { id: "city", serviceLocations: [{ cityId: "pune", areaId: null, pincode: null }] },
  { id: "area", serviceLocations: [{ cityId: "pune", areaId: "baner", pincode: null }] },
  { id: "pin", serviceLocations: [{ cityId: "pune", areaId: "baner", pincode: "411045" }] },
  { id: "city-second", serviceLocations: [{ cityId: "pune", areaId: null, pincode: null }] },
];

assert.equal(formatLocationPreference(cities, preference), "Baner, Pune");
assert.equal(findSupportedSelection(cities, { cityId: "pune", areaId: "old-area" }), null);
assert.equal(getVendorProximity(vendors[3], preference), "pincode");
assert.equal(vendorNearbyLabel(vendors[2], preference), "In Your Area");
assert.equal(vendorNearbyLabel(vendors[1], preference), "Nearby");
assert.equal(vendorNearbyLabel(vendors[0], preference), null);
assert.deepEqual(
  rankVendorsByLocation(vendors, preference).map((vendor) => vendor.id),
  ["pin", "area", "city", "city-second", "other"],
);
assert.equal(
  formatCanonicalVendorLocation({
    localityName: "Chakan",
    talukaName: "Khed",
    districtName: "Pune",
    stateName: "Maharashtra",
  }),
  "Chakan, Khed, Pune, Maharashtra",
);
assert.equal(
  formatCanonicalVendorLocation({
    localityName: "Khed",
    talukaName: "Khed",
    districtName: "Pune",
    stateName: "Maharashtra",
  }),
  "Khed, Pune, Maharashtra",
);
assert.deepEqual(
  rankVendorsByLocation(vendors, preference, true).map((vendor) => vendor.id),
  ["pin", "area", "city", "city-second"],
);
assert.deepEqual(
  rankVendorsByLocation(vendors, null).map((vendor) => vendor.id),
  vendors.map((vendor) => vendor.id),
);

const membershipVendors = [
  { id: "other-elite", membershipPlan: "Elite", serviceLocations: [{ cityId: "mumbai", areaId: null, pincode: null }] },
  { id: "city-free", membershipPlan: null, serviceLocations: [{ cityId: "pune", areaId: null, pincode: null }] },
  { id: "city-premium", membershipPlan: "Premium", serviceLocations: [{ cityId: "pune", areaId: null, pincode: null }] },
  { id: "city-elite", membershipPlan: "Elite", serviceLocations: [{ cityId: "pune", areaId: null, pincode: null }] },
  { id: "area-free", membershipPlan: null, serviceLocations: [{ cityId: "pune", areaId: "baner", pincode: null }] },
];

assert.deepEqual(
  rankVendorsByLocationAndMembership(membershipVendors, preference).map((vendor) => vendor.id),
  ["area-free", "city-elite", "city-premium", "city-free", "other-elite"],
);
assert.deepEqual(
  rankVendorsByLocationAndMembership(membershipVendors, null).map((vendor) => vendor.id),
  ["other-elite", "city-elite", "city-premium", "city-free", "area-free"],
);

console.log("Location selection and ranking tests passed.");
