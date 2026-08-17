import { Injectable, Logger, Optional } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { SaleRepositoryPort, SaleItemCreateData } from "./sale.repository.port";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import {
  PromotionResolverService,
} from "../../promotions/application/promotion-resolver.service";
import {
  InvoiceStatus,
  ManualDiscountModality,
  Sale,
} from "../domain/sale.entity";
import {
  ValidationError,
} from "../../../shared/errors/domain.error";
import { Money } from "../../../shared/money/money.helper";
import {
  CreateManualDiscountInput,
  CreateSaleInput,
  CreateSaleItemInput,
} from "./create-sale.types";
import { SaleInputNormalizer } from "./sale-input-normalizer";
import { SalePaymentPolicy } from "./sale-payment-policy";
import { SaleItemResolver } from "./sale-item-resolver";
import { SalePricingCalculator } from "./sale-pricing-calculator";
import { SaleFiscalOrchestrator } from "./sale-fiscal-orchestrator";

export {
  CreateManualDiscountInput,
  CreateSaleInput,
  CreateSaleItemInput,
};

@Injectable()
/**
 * Creates a sale with optional ARCA invoice issuance and promotion resolution.
 *
 * Stock deduction: after the sale is persisted, this use case iterates over
 * catalog items whose product has `maneja_stock=true` and calls
 * {@link InventoryRepositoryPort.adjustBalance} with a negative quantity
 * and type `"sale"` using the sale ID as a reference. Ad-hoc (non-catalog)
 * items and unmanaged products are skipped. Duplicate product lines are
 * aggregated into a single adjustment per product before locking.
 */
export class CreateSaleUseCase {
  private readonly logger = new Logger(CreateSaleUseCase.name);
  private readonly inputNormalizer = new SaleInputNormalizer();
  private readonly paymentPolicy = new SalePaymentPolicy();
  private readonly itemResolver: SaleItemResolver;
  private readonly pricingCalculator = new SalePricingCalculator();
  private readonly fiscalOrchestrator: SaleFiscalOrchestrator;

  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly sales: SaleRepositoryPort,
    private readonly inventory: InventoryRepositoryPort,
    private readonly issueInvoice: IssueArcaInvoiceUseCase,
    private readonly promotionResolver: PromotionResolverService,
    @Optional() itemResolver?: SaleItemResolver,
    @Optional() fiscalOrchestrator?: SaleFiscalOrchestrator,
  ) {
    this.itemResolver =
      itemResolver ??
      new SaleItemResolver(this.products, this.promotionResolver);
    this.fiscalOrchestrator =
      fiscalOrchestrator ??
      new SaleFiscalOrchestrator(this.issueInvoice);
  }

  async execute(input: CreateSaleInput): Promise<Sale> {
    const normalized = this.inputNormalizer.normalize(input);
    const paymentMethods = this.paymentPolicy.validate(normalized.paymentMethods);
    const splitTicketGroups = normalized.splitTicketGroups;
    const invoiceRequested = normalized.invoiceRequested;

    const resolved = await this.itemResolver.resolve(normalized);
    const pricing = this.pricingCalculator.price({
      resolved,
      manualDiscount: normalized.manualDiscount,
      invoiceRequested,
    });
    const saleItems = pricing.saleItems;
    const postPromotionSubtotal = pricing.postPromotionSubtotal;
    const manualDiscount = pricing.manualDiscount;
    const finalTotal = pricing.finalTotal;

    const fiscal = await this.fiscalOrchestrator.issueIfRequested({
      invoiceRequested,
      saleItems,
      resolvedLines: resolved.lines,
      postPromotionSubtotal,
      manualDiscountAmount: manualDiscount.amount,
    });

    const sale = await this.sales.create({
      user_id: normalized.userId,
      items: saleItems,
      payment_methods: paymentMethods,
      split_ticket_groups: splitTicketGroups,
      total: Money.toString(finalTotal),
      manual_discount_amount: Money.toString(manualDiscount.amount),
      manual_discount_modality: manualDiscount.modality,
      manual_discount_percentage: manualDiscount.percentage,
      invoice_status: fiscal.invoiceStatus,
      cae: fiscal.fiscalFields.cae,
      cae_vto: fiscal.fiscalFields.cae_vto,
      cbte_nro: fiscal.fiscalFields.cbte_nro,
      cbte_tipo: fiscal.fiscalFields.cbte_tipo,
      pto_vta: fiscal.fiscalFields.pto_vta,
      invoice_requested_at: fiscal.invoiceRequestedAt,
    });

    // Deduct stock for managed catalog items (ad-hoc items are skipped)
    const managedDeductions = new Map<string, number>();
    for (const line of resolved.lines) {
      if (line.kind === "ad-hoc" || !line.stockManaged) continue;
      const current = managedDeductions.get(line.lineId) ?? 0;
      managedDeductions.set(line.lineId, current + line.quantity);
    }

    // Deterministic lock order: sort product UUIDs before locking balances
    const sortedProductIds = [...managedDeductions.keys()].sort();
    for (const productId of sortedProductIds) {
      const totalDeduction = managedDeductions.get(productId)!;
      try {
        await this.inventory.adjustBalance(
          productId,
          -totalDeduction,
          "sale",
          sale.id,
        );
      } catch (error) {
        this.logger.error(
          `Failed to deduct stock for product ${productId} after sale ${sale.id}; sale was persisted and will be returned`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return sale;
  }
}
