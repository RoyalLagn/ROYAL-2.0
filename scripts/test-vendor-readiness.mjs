import assert from "node:assert/strict";
import { VendorReadinessRules as rules } from "../services/vendorReadiness.ts";

const checks = [
  ["business missing", rules.businessInfo(null), "missing"],
  ["business partial", rules.businessInfo({ business_name: "Studio" }), "partial"],
  ["business complete", rules.businessInfo({ business_name: "Studio", owner_name: "Owner", category_id: "category" }), "complete"],
  ["about missing", rules.about({ description: "  " }), "missing"],
  ["about complete after required description", rules.about({ description: "A saved introduction", experience: null }), "complete"],
  ["location missing", rules.location({ pincode: "" }), "missing"],
  ["location partial", rules.location({ pincode: "411033" }), "partial"],
  ["location complete", rules.location({ pincode: "411033", geo_pincode_locality_id: "locality", geo_taluka_id: "taluka", geo_district_id: "district", geo_state_id: "state" }), "complete"],
  ["contact missing", rules.contact({}), "missing"],
  ["contact partial with optional social only", rules.contact({ instagram: "royallagn" }), "partial"],
  ["contact complete", rules.contact({ contact_phone: "9876543210" }), "complete"],
  ["brand missing", rules.brand({}), "missing"],
  ["brand complete", rules.brand({ logo_url: "https://example.com/logo.png" }), "complete"],
  ["services missing", rules.services([]), "missing"],
  ["services partial", rules.services([{ status: "inactive" }]), "partial"],
  ["services complete", rules.services([{ status: "active" }]), "complete"],
  ["pricing missing", rules.pricing([]), "missing"],
  ["pricing partial", rules.pricing([{ status: "active", price_type: "contact", price: null }]), "partial"],
  ["pricing complete", rules.pricing([{ status: "active", price_type: "fixed", price: 25000 }]), "complete"],
  ["services and packages missing", rules.servicesAndPackages([]), "missing"],
  ["services and packages partial for draft", rules.servicesAndPackages([{ status: "draft", price_type: "fixed", price: 25000 }]), "partial"],
  ["services and packages partial without published price", rules.servicesAndPackages([{ status: "active", price_type: "contact", price: null }]), "partial"],
  ["services and packages complete", rules.servicesAndPackages([{ status: "active", price_type: "fixed", price: 25000 }]), "complete"],
  ["portfolio missing", rules.portfolio([], []), "missing"],
  ["portfolio partial", rules.portfolio([], [{}]), "partial"],
  ["portfolio complete", rules.portfolio([{}], Array.from({ length: 6 }, () => ({}))), "complete"],
  ["availability needs vendor", rules.availability(null, []), "attention"],
  ["availability complete by default", rules.availability({ id: "vendor" }, []), "complete"],
  ["tags missing", rules.tags({ tags: [] }), "missing"],
  ["tags complete after one saved tag", rules.tags({ tags: ["candid wedding"] }), "complete"],
];

for (const [name, actual, expected] of checks) assert.equal(actual, expected, name);
console.log(`Vendor readiness: ${checks.length} checks passed.`);
