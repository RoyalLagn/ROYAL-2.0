// Resolve a complete pair together; never mix live and legacy test secrets.
export function resolveRazorpayCredentials(readEnv: (name: string) => string | undefined) {
  const configuredId = readEnv("RAZORPAY_KEY_ID")?.trim();
  const configuredSecret = readEnv("RAZORPAY_KEY_SECRET")?.trim();
  const useConfigured = Boolean(configuredId || configuredSecret);
  const idName = useConfigured ? "RAZORPAY_KEY_ID" : "RAZORPAY_TEST_KEY_ID";
  const secretName = useConfigured ? "RAZORPAY_KEY_SECRET" : "RAZORPAY_TEST_KEY_SECRET";
  const keyId = useConfigured ? configuredId : readEnv(idName)?.trim();
  const keySecret = useConfigured ? configuredSecret : readEnv(secretName)?.trim();
  if (!keyId) throw new Error(`${idName} is not configured`);
  if (!keySecret) throw new Error(`${secretName} is not configured`);
  const valid = useConfigured ? /^rzp_(?:test|live)_[A-Za-z0-9]+$/ : /^rzp_test_[A-Za-z0-9]+$/;
  if (!valid.test(keyId)) throw new Error(`${idName} is not a valid Razorpay ${useConfigured ? "test or live" : "test"} key ID`);
  return { keyId, keySecret };
}
