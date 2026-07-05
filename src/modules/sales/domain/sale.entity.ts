export type InvoiceStatus = "none" | "issued" | "failed";
export const PAYMENT_METHODS = ["cash", "transfer", "card", "qr"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PaymentMethodAllocation {
  method: PaymentMethod;
  amount: string;
}

export interface SaleSplitTicketItemInput {
  product_id: string;
  quantity: number;
}

export interface SaleSplitTicketGroupInput {
  label: string;
  items: SaleSplitTicketItemInput[];
}

export interface SaleItemSplitTicketInput {
  group_1_quantity: number;
  group_2_quantity: number;
}

export interface SaleSplitTicketItem {
  product_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

export interface SaleSplitTicketGroup {
  label: string;
  items: SaleSplitTicketItem[];
}

export class Sale {
  id!: string;
  user_id!: string;
  total!: string;
  payment_methods!: PaymentMethodAllocation[];
  items!: SaleItem[];
  split_ticket_groups?: SaleSplitTicketGroup[] | null;
  invoice_status!: InvoiceStatus;
  cae?: string | null;
  cae_vto?: string | null;
  cbte_nro?: number | null;
  cbte_tipo?: number | null;
  pto_vta?: number | null;
  invoice_requested_at?: Date | null;
  created_at!: Date;
  updated_at!: Date;
}

export class SaleItem {
  id!: string;
  sale_id!: string;
  product_id!: string;
  quantity!: number;
  unit_price!: string;
  subtotal!: string;
}
