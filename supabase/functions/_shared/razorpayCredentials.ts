// Production payments accept only a complete live credential pair.
export function resolveRazorpayCredentials(readEnv: (name: string) => string | undefined) {
  const keyId = readEnv("RAZORPAY_KEY_ID")?.trim();
  const keySecret = readEnv("RAZORPAY_KEY_SECRET")?.trim();
  if (!keyId) throw new Error("RAZORPAY_KEY_ID is not configured");
  if (!keySecret) throw new Error("RAZORPAY_KEY_SECRET is not configured");
  if (!/^rzp_live_[A-Za-z0-9]+$/.test(keyId)) {
    throw new Error("RAZORPAY_KEY_ID must be a valid Razorpay live key ID");
  }
  return { keyId, keySecret };
}
