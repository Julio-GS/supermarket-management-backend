import { PaymentMethod, PAYMENT_METHODS } from "../../sales/domain/sale.entity";

export type ReportWindow = "day" | "week" | "month";

export const REPORT_WINDOWS: readonly ReportWindow[] = ["day", "week", "month"];

export interface PaymentMethodBreakdown {
  method: PaymentMethod;
  amount: string;
}

export interface TopProduct {
  productId: string;
  detalle: string;
  unitsSold: number;
}

export interface BusinessReport {
  window: ReportWindow;
  range: { startsAt: string; endsAt: string };
  totalCollectedAmount: string;
  paymentMethodBreakdown: PaymentMethodBreakdown[];
  topProducts: TopProduct[];
}

export interface ReportAggregateData {
  totalCollectedAmount: string;
  paymentMethodBreakdown: { method: PaymentMethod; amount: string }[];
  topProducts: { productId: string; detalle: string; unitsSold: number }[];
}
