declare module "react-native-razorpay" {
  export interface RazorpayOptions {
    key: string;
    amount?: number;
    currency?: string;
    order_id?: string;
    name?: string;
    description?: string;
    image?: string;
    prefill?: {
      email?: string;
      contact?: string;
      name?: string;
    };
    theme?: {
      color?: string;
    };
    [key: string]: unknown;
  }

  export interface RazorpaySuccessResult {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }

  interface RazorpayCheckout {
    open(options: RazorpayOptions): Promise<RazorpaySuccessResult>;
  }

  const RazorpayCheckoutModule: RazorpayCheckout;
  export default RazorpayCheckoutModule;
}
