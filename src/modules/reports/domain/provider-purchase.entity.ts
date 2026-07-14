export interface ProviderPurchase {
  id: string;
  provider_name: string;
  amount: string;
  payment_method: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProviderPurchaseReport {
  window: string;
  range: { startsAt: string; endsAt: string };
  totalAmount: string;
  purchaseCount: number;
  paymentMethodBreakdown: { method: string; amount: string }[];
}
