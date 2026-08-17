import { EntityManager } from "typeorm";
import type {
  Sale,
  InvoiceStatus,
  ManualDiscountModality,
  PaymentMethodAllocation,
  SaleItemAppliedPromotion,
  SaleSplitTicketGroupInput,
} from "../domain/sale.entity";
import { Page, PaginationOptions } from "../../../shared/read-model/page";
import { ArcaInvoiceResult } from "./arca-invoice.port";

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
  manual_discount_amount?: string | null;
  manual_discount_modality?: ManualDiscountModality | null;
  manual_discount_percentage?: string | null;
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

  /**
   * Reads a sale with pessimistic write lock for the given user.
   * Used by the fiscal retry flow to prevent duplicate ARCA issuance.
   */
  abstract findByIdForUserForUpdate(
    id: string,
    user_id: string,
    manager?: EntityManager,
  ): Promise<Sale | null>;

  /**
   * Marks a sale invoice as issued with the ARCA fiscal fields.
   * Must be called within the same transaction that acquired the lock.
   */
  abstract markInvoiceIssued(
    id: string,
    user_id: string,
    invoiceResult: ArcaInvoiceResult,
    manager?: EntityManager,
  ): Promise<Sale>;

  /**
   * Atomically transitions a sale's invoice_status from an expected state
   * to a target state. Uses pessimistic_write lock to prevent races.
   *
   * If the sale does not exist or its current status does not match
   * `expectedStatus`, returns `null` (no update performed).
   *
   * When `fiscalFields` is provided the corresponding columns (cae,
   * cae_vto, cbte_nro, cbte_tipo, pto_vta) are updated in the same
   * statement. Use this for `issuing→issued` transitions.
   */
  abstract transitionInvoiceStatus(
    id: string,
    user_id: string,
    expectedStatus: InvoiceStatus,
    nextStatus: InvoiceStatus,
    fiscalFields?: {
      cae: string;
      cae_vto: string;
      cbte_nro: number;
      cbte_tipo: number;
      pto_vta: number;
    },
    manager?: EntityManager,
  ): Promise<Sale | null>;
}
