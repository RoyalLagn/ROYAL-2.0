import type { RazorpayCheckoutOptions, RazorpayCheckoutResult } from "@/subscriptions/payments/types";

// `react-native-razorpay` registers a NativeEventEmitter against a native module
// at import time. That native module is not present inside Expo Go, and
// `NativeEventEmitter` throws immediately when constructed with an undefined
// module — which previously crashed the entire app on launch as soon as this
// file was evaluated, even on screens that never open checkout. Load it lazily
// so import-time evaluation never touches the native module; only calling
// `openRazorpayCheckout` does, and only once real checkout is triggered.
type RazorpayCheckoutModule = typeof import("react-native-razorpay").default;
let razorpayModule: RazorpayCheckoutModule | null | undefined;
function getRazorpay(): RazorpayCheckoutModule | null {
  if (razorpayModule !== undefined) return razorpayModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    razorpayModule = require("react-native-razorpay").default as RazorpayCheckoutModule;
  } catch {
    razorpayModule = null;
  }
  return razorpayModule;
}

export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<RazorpayCheckoutResult> {
  if (!options.orderId || !options.keyId || !options.amount || !options.currency) {
    throw new Error("Razorpay order details are incomplete");
  }
  const RazorpayCheckout = getRazorpay();
  if (!RazorpayCheckout) {
    throw new Error(
      "Payments require the RoyalLagn app installed from a development or production build — this isn't available in Expo Go.",
    );
  }
  const result = await RazorpayCheckout.open({
    key: options.keyId,
    order_id: options.orderId,
    amount: options.amount,
    currency: options.currency,
    name: "RoyalLagn",
    description: options.planName,
    image: "https://royallagn.com/favicon.png",
    prefill: { name: options.vendorName, email: options.email, contact: options.phone },
    theme: { color: "#E91E63" },
  });
  return result as RazorpayCheckoutResult;
}

