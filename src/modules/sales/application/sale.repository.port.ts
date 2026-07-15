import {
  Sale,
  InvoiceStatus,
  PaymentMethodAllocation,
  SaleItemAppliedPromotion,
  SaleSplitTicketGroupInput,
} from "../domain/sale.entity";
import { Page, PaginationOptions } from "../../../shared/read-model/page";

export type SaleReadOptions = PaginationOptions;

export interface SaleItemCreateData {
  product_id: string | null;
  name?: string | null;
  description?: string | null;
  iva?: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
  discount_amount?: string;
  applied_promotions?: SaleItemAppliedPromotion[];
  applied_promotion_id?: string | null;
  applied_promotion_type?: string | null;
}

export interface SaleCreateInput {
  user_id: string;
  items: SaleItemCreateData[];
  total: string;
  payment_methods: PaymentMethodAllocation[];
  split_ticket_groups?: SaleSplitTicketGroupInput[] | null;
  invoice_status: InvoiceStatus;
  cae?: string | null;
  cae_vto?: string | null;
  cbte_nro?: number | null;
  cbte_tipo?: number | null;
  pto_vta?: number | null;
  invoice_requested_at?: Date | null;
}

export abstract class SaleRepositoryPort {
  abstract create(input: SaleCreateInput): Promise<Sale>;
  abstract findByUser(user_id: string): Promise<Sale[]>;
  abstract findPageByUser(
    user_id: string,
    options: SaleReadOptions,
  ): Promise<Page<Sale>>;
  abstract findByIdForUser(id: string, user_id: string): Promise<Sale | null>;
}
