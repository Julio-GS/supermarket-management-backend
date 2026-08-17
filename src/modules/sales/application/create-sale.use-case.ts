import { Injectable, Logger, Optional } from "@nestjs/common";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { SaleRepositoryPort } from "./sale.repository.port";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import {
  PromotionResolverService,
} from "../../promotions/application/promotion-resolver.service";
import { Sale } from "../domain/sale.entity";
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
import { SalePersistenceAssembler } from "./sale-persistence-assembler";

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
  private readonly persistenceAssembler = new SalePersistenceAssembler();

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
    const invoiceRequested = normalized.invoiceRequested;

    const resolved = await this.itemResolver.resolve(normalized);
    const pricing = this.pricingCalculator.price({
      resolved,
      manualDiscount: normalized.manualDiscount,
      invoiceRequested,
    });

    const fiscal = await this.fiscalOrchestrator.issueIfRequested({
      invoiceRequested,
      saleItems: pricing.saleItems,
      resolvedLines: resolved.lines,
      postPromotionSubtotal: pricing.postPromotionSubtotal,
      manualDiscountAmount: pricing.manualDiscount.amount,
    });

    const saleCreateInput = this.persistenceAssembler.assemble({
      userId: normalized.userId,
      pricing,
      paymentMethods,
      splitTicketGroups: normalized.splitTicketGroups,
      fiscal,
    });

    const sale = await this.sales.create(saleCreateInput);

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
