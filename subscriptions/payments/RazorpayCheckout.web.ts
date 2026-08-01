import type { RazorpayCheckoutOptions, RazorpayCheckoutResult } from "@/subscriptions/payments/types";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: any) => void) => void };
  }
}

async function loadCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-royallagn-razorpay="true"]');
    if (existing) {
      if (existing.dataset.loadState === "failed") {
        existing.remove();
        reject(new Error("Razorpay Checkout could not load. Check your connection and try again."));
        return;
      }
      if (existing.dataset.loadState === "loaded") {
        if (window.Razorpay) resolve();
        else reject(new Error("Razorpay Checkout is unavailable. Refresh the page and try again."));
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay Checkout could not load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.royallagnRazorpay = "true";
    script.onload = () => {
      script.dataset.loadState = "loaded";
      if (window.Razorpay) resolve();
      else reject(new Error("Razorpay Checkout is unavailable. Refresh the page and try again."));
    };
    script.onerror = () => {
      script.dataset.loadState = "failed";
      reject(new Error("Razorpay Checkout could not load. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
}

export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<RazorpayCheckoutResult> {
  if (!options.orderId || !options.keyId || !options.amount || !options.currency) {
    throw new Error("Razorpay order details are incomplete");
  }
  await loadCheckout();
  return await new Promise<RazorpayCheckoutResult>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: options.keyId,
      order_id: options.orderId,
      amount: options.amount,
      currency: options.currency,
      name: "RoyalLagn",
      description: options.planName,
      prefill: { name: options.vendorName, email: options.email, contact: options.phone },
      theme: { color: "#E91E63" },
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
      handler: (response: RazorpayCheckoutResult) => resolve(response),
    });
    checkout.on("payment.failed", (response) => reject(new Error(response?.error?.description ?? "Payment failed")));
    checkout.open();
  });
}
