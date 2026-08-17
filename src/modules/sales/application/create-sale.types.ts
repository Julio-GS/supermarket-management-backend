import {
  ManualDiscountModality,
  PaymentMethodAllocation,
  SaleItemSplitTicketInput,
  SaleSplitTicketGroupInput,
} from "../domain/sale.entity";

export interface CreateSaleItemInput {
  product_id?: string;
  name?: string;
  description?: string;
  unit_price?: string;
  quantity: number;
  line_total?: string;
  split_ticket?: SaleItemSplitTicketInput;
}

export interface CreateManualDiscountInput {
  modality: ManualDiscountModality;
  amount?: string;
  percentage?: string;
}

export interface CreateSaleInput {
  user_id: string;
  items: CreateSaleItemInput[];
  payment_methods: PaymentMethodAllocation[];
  split_ticket_groups?: SaleSplitTicketGroupInput[] | null;
  invoice_requested?: boolean;
  manual_discount?: CreateManualDiscountInput | null;
}

export interface NormalizedSaleRequest {
  userId: string;
  items: NormalizedSaleItem[];
  paymentMethods: PaymentMethodAllocation[];
  splitTicketGroups: SaleSplitTicketGroupInput[] | null;
  invoiceRequested: boolean;
  manualDiscount: CreateManualDiscountInput | null | undefined;
}

export type NormalizedSaleItem =
  | CatalogReferenceSaleItemInput
  | AdHocSaleItemInput;

export interface CatalogReferenceSaleItemInput {
  kind: "catalog-reference";
  originalIndex: number;
  productId: string;
  quantity: number;
  /** Preserved raw user-provided value. Allowed or required only after product pricing_mode is known. */
  lineTotal?: string | null;
  splitTicket?: SaleItemSplitTicketInput;
}

export interface AdHocSaleItemInput {
  kind: "ad-hoc";
  originalIndex: number;
  syntheticProductId: string;
  name: string;
  description: string | null;
  unitPrice: string;
  quantity: number;
  splitTicket?: SaleItemSplitTicketInput;
}
