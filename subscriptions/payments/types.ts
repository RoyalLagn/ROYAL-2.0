export type RazorpayOrder = {
  paymentRecordId: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  keyId?: string;
  planName: string;
  freeActivation?: boolean;
};

export type RazorpayCheckoutResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type RazorpayCheckoutOptions = RazorpayOrder & {
  vendorName?: string;
  email?: string;
  phone?: string;
};

