import assert from "node:assert/strict";
import {
  normalizeEmailAddress,
  normalizeGoogleMapsUrl,
  normalizeInstagramUrl,
  normalizePhoneNumber,
  normalizeWebsiteUrl,
} from "../services/externalLinkNormalization.ts";

for (const input of ["hoteltiptop.in", "www.hoteltiptop.in", "https://hoteltiptop.in", "http://hoteltiptop.in"]) {
  assert.match(normalizeWebsiteUrl(input), /^https?:\/\//);
}
assert.equal(normalizeWebsiteUrl("javascript:alert(1)"), null);
assert.equal(normalizeInstagramUrl("@hoteltiptopinternational"), "https://www.instagram.com/hoteltiptopinternational/");
assert.equal(normalizeInstagramUrl("instagram.com/hoteltiptopinternational"), "https://www.instagram.com/hoteltiptopinternational/");
assert.equal(normalizeInstagramUrl("https://www.instagram.com/hoteltiptopinternational/"), "https://www.instagram.com/hoteltiptopinternational/");
assert.equal(normalizeInstagramUrl("https://example.com/not-instagram"), null);
assert.equal(normalizePhoneNumber("+91 20-6311 1111"), "+912063111111");
assert.equal(normalizePhoneNumber("98765 43210"), "+919876543210");
assert.equal(normalizeEmailAddress(" INFO@HOTELTIPTOP.IN "), "info@hoteltiptop.in");
assert.equal(normalizeEmailAddress("not-an-email"), null);
assert.equal(
  normalizeGoogleMapsUrl({ latitude: 18.5992, longitude: 73.7637, address: "ignored" }),
  "https://www.google.com/maps/search/?api=1&query=18.5992%2C73.7637",
);
assert.match(normalizeGoogleMapsUrl({ address: "Hotel Tip Top International, Wakad, Pune" }), /query=Hotel%20Tip%20Top/);
assert.equal(normalizeGoogleMapsUrl({ googleMapsUrl: "javascript:alert(1)" }), null);

console.log("external link normalization tests passed");
