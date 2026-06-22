export type InvoiceStatus = "none" | "issued" | "failed";

export class Sale {
  id!: string;
  user_id!: string;
  total!: string;
  items!: SaleItem[];
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
