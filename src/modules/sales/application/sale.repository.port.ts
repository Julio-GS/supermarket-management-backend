import { Sale, InvoiceStatus } from "../domain/sale.entity";
import { Page, PaginationOptions } from "../../../shared/read-model/page";

export type SaleReadOptions = PaginationOptions;

export interface SaleItemCreateData {
  product_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

export interface SaleCreateInput {
  user_id: string;
  items: SaleItemCreateData[];
  total: string;
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
