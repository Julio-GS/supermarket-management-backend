import type { PaymentMethod } from "../../sales/domain/sale.entity";

export type ReportWindow = "day" | "week" | "month";
export type ReportMode = ReportWindow | "custom";

export const REPORT_WINDOWS: readonly ReportWindow[] = ["day", "week", "month"];

export interface PaymentMethodBreakdown {
  method: PaymentMethod;
  amount: string;
}

export interface TopProduct {
  productId: string;
  detalle: string;
  units_sold: number;
}

export interface FiscalReportBucket {
  amount: string;
  sale_count: number;
}

export interface FiscalReportGrouping {
  issued: FiscalReportBucket;
  none: FiscalReportBucket;
  incident: FiscalReportBucket;
}

export interface BusinessReport {
  window: ReportMode;
  range: { startsAt: string; endsAt: string };
  totalCollectedAmount: string;
  paymentMethodBreakdown: PaymentMethodBreakdown[];
  topProducts: TopProduct[];
  fiscal: FiscalReportGrouping;
}

export interface ReportAggregateData {
  totalCollectedAmount: string;
  paymentMethodBreakdown: { method: PaymentMethod; amount: string }[];
  topProducts: { productId: string; detalle: string; units_sold: number }[];
  fiscal: FiscalReportGrouping;
}
