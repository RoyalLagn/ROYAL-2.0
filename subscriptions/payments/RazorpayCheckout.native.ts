import RazorpayCheckout from "react-native-razorpay";
import type { RazorpayCheckoutOptions, RazorpayCheckoutResult } from "@/subscriptions/payments/types";

export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<RazorpayCheckoutResult> {
  if (!options.orderId || !options.keyId || !options.amount || !options.currency) {
    throw new Error("Razorpay order details are incomplete");
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

