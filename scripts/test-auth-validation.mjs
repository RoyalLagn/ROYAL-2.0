// Behavioral checks for the shared auth form validation used by
// Login/Signup, Create Password, and vendor/admin contact-detail forms
// (`utils/authValidation.ts`). These exercise real function behavior --
// valid/invalid inputs and edge cases -- not source-string assertions.
import assert from "node:assert/strict";
import {
  normalizeOptionalUrl,
  normalizePhone,
  normalizeSocialUrl,
  passwordRequirements,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} from "../utils/authValidation.ts";

// --- Email -----------------------------------------------------------
assert.equal(validateEmail("person@example.com"), true, "a well-formed email must be accepted");
assert.equal(validateEmail("  PERSON@Example.com  "), true, "email validation must tolerate surrounding whitespace/case");
assert.equal(validateEmail("not-an-email"), false, "an email missing @ and a domain must be rejected");
assert.equal(validateEmail(""), false, "an empty email must be rejected");

// --- Full name ---------------------------------------------------------
assert.equal(validateFullName("Asha Rao"), true, "a non-empty name must be accepted");
assert.equal(validateFullName("   "), false, "a whitespace-only name must be rejected");
assert.equal(validateFullName(""), false, "an empty name must be rejected");

// --- Phone ---------------------------------------------------------------
assert.equal(normalizePhone("98765 43210"), "9876543210", "spaces must be stripped from a local number");
assert.equal(normalizePhone("+91 98765 43210"), "+919876543210", "a leading + must be preserved and internal spaces stripped");
assert.equal(validatePhone("9876543210"), true, "a 10-digit local number must be accepted");
assert.equal(validatePhone("+919876543210"), true, "an internationally-prefixed number must be accepted");
assert.equal(validatePhone("12345"), false, "a number shorter than 7 digits must be rejected");
assert.equal(validatePhone("1".repeat(16)), false, "a number longer than 15 digits must be rejected");
assert.equal(validatePhone("abc-def-ghij"), false, "a number with no digits must be rejected");

// --- Password requirements / error recovery on weak input --------------
assert.deepEqual(
  passwordRequirements("Passw0rd"),
  { minimumLength: true, uppercase: true, lowercase: true, number: true },
  "a password meeting all rules must report every requirement as satisfied",
);
assert.deepEqual(
  passwordRequirements("password"),
  { minimumLength: true, uppercase: false, lowercase: true, number: false },
  "a password missing uppercase/number must report exactly those gaps -- this is what drives the create-password screen's live checklist",
);
assert.equal(validatePassword("Passw0rd"), true, "a password satisfying every rule must validate");
assert.equal(validatePassword("weak"), false, "a password failing any rule must not validate");

// --- Optional URL normalization + recoverable errors --------------------
assert.equal(normalizeOptionalUrl(""), null, "a blank optional URL must normalize to null, not throw");
assert.equal(normalizeOptionalUrl("example.com"), "https://example.com/", "a bare domain must be upgraded to https");
assert.equal(normalizeOptionalUrl("https://example.com"), "https://example.com/", "an already-valid https URL must round-trip");
assert.throws(
  () => normalizeOptionalUrl("not a valid url with spaces"),
  "malformed input must throw a recoverable error instead of silently accepting garbage",
);

// --- Social URL normalization + recoverable errors -----------------------
assert.equal(normalizeSocialUrl("", "instagram"), null, "a blank handle must normalize to null");
assert.equal(normalizeSocialUrl("@my.handle", "instagram"), "https://instagram.com/my.handle", "a bare handle must expand to a full profile URL");
assert.equal(
  normalizeSocialUrl("https://instagram.com/my.handle", "instagram"),
  "https://instagram.com/my.handle",
  "an already-valid profile URL must round-trip",
);
assert.throws(
  () => normalizeSocialUrl("https://facebook.com/someone", "instagram"),
  /valid Instagram/,
  "a URL from the wrong platform's domain must throw a recoverable, user-facing error",
);

console.log("auth validation behavior tests passed");
