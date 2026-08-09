export type RazorpayOrder = {
  paymentRecordId: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  keyId?: string;
  planName: string;
  freeActivation?: boolean;
  pricing?: {
    originalAmount: number;
    intervalDiscountPercentage: number;
    intervalDiscountAmount: number;
    promotionalDiscountPercentage: number;
    promotionalDiscountAmount: number;
    totalSavings: number;
    payableAmount: number;
  };
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
