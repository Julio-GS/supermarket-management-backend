import { Decimal } from "decimal.js";
import {
  InvoiceStatus,
  ManualDiscountModality,
  PaymentMethodAllocation,
  SaleItemSplitTicketInput,
  SaleSplitTicketGroupInput,
} from "../domain/sale.entity";
import { Product } from "../../products/domain/product.entity";
import { ResolvedPromotion } from "../../promotions/application/promotion-resolver.service";
import { SaleItemCreateData } from "./sale.repository.port";

export type PromotionResolutionResult = ResolvedPromotion;

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

export type ResolvedSaleLineKind =
  | "catalog-fixed"
  | "catalog-manual"
  | "ad-hoc";

export type ResolvedSaleLine =
  | ResolvedCatalogFixedLine
  | ResolvedCatalogManualLine
  | ResolvedAdHocLine;

export interface ResolvedCatalogFixedLine {
  kind: "catalog-fixed";
  lineId: string;
  originalIndex: number;
  product: Product;
  quantity: number;
  unitPrice: string;
  lineTotal?: never;
  promotionEligible: true;
  stockManaged: boolean;
  facturable: boolean;
  ivaForPersistence: string | null;
  splitTicket?: SaleItemSplitTicketInput;
}

export interface ResolvedCatalogManualLine {
  kind: "catalog-manual";
  lineId: string;
  originalIndex: number;
  product: Product;
  quantity: 1;
  unitPrice: string;
  lineTotal: string;
  promotionEligible: false;
  stockManaged: boolean;
  facturable: boolean;
  ivaForPersistence: string | null;
  splitTicket?: SaleItemSplitTicketInput;
}

export interface ResolvedAdHocLine {
  kind: "ad-hoc";
  lineId: string;
  originalIndex: number;
  product?: never;
  adHoc: { name: string; description: string | null };
  quantity: number;
  unitPrice: string;
  lineTotal?: never;
  promotionEligible: true;
  stockManaged: false;
  facturable: true;
  ivaForPersistence: "21.00";
  splitTicket?: SaleItemSplitTicketInput;
}

export interface ResolvedSaleLines {
  lines: ResolvedSaleLine[];
  promotionsByLineId: Map<string, PromotionResolutionResult | null>;
  promotionsByOriginalIndex?: Map<number, PromotionResolutionResult | null>;
}

export interface ResolvedManualDiscount {
  amount: Decimal;
  modality: ManualDiscountModality | null;
  percentage: string | null;
}

export interface PricedSaleLine {
  lineId: string;
  originalIndex: number;
  kind: ResolvedSaleLine["kind"];
  quantity: number;
  unitPrice: Decimal;
  grossSubtotal: Decimal;
  discountAmount: Decimal;
  discountedSubtotal: Decimal;
  saleItem: SaleItemCreateData;
}

export interface PricingResult {
  pricedLines: PricedSaleLine[];
  saleItems: SaleItemCreateData[];
  postPromotionSubtotal: Decimal;
  manualDiscount: ResolvedManualDiscount;
  finalTotal: Decimal;
}

export interface FiscalFields {
  cae: string | null;
  cae_vto: string | null;
  cbte_nro: number | null;
  cbte_tipo: number | null;
  pto_vta: number | null;
}

export interface FiscalResult {
  invoiceStatus: InvoiceStatus;
  invoiceRequestedAt: Date | null;
  fiscalFields: FiscalFields;
}

export interface InventoryDeductionLine {
  productId: string;
  quantity: number;
  stockManaged: boolean;
}

export function toInventoryDeductionLines(
  lines: ResolvedSaleLine[],
): InventoryDeductionLine[] {
  return lines.map((line) => ({
    productId: line.lineId,
    quantity: line.quantity,
    stockManaged: line.kind !== "ad-hoc" && line.stockManaged,
  }));
}


