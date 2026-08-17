import { Injectable, Optional } from "@nestjs/common";
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
  toInventoryDeductionLines,
} from "./create-sale.types";
import { SaleInputNormalizer } from "./sale-input-normalizer";
import { SalePaymentPolicy } from "./sale-payment-policy";
import { SaleItemResolver } from "./sale-item-resolver";
import { SalePricingCalculator } from "./sale-pricing-calculator";
import { SaleFiscalOrchestrator } from "./sale-fiscal-orchestrator";
import { SalePersistenceAssembler } from "./sale-persistence-assembler";
import { PostPersistenceInventoryPolicy } from "./post-persistence-inventory-policy";

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
  private readonly inputNormalizer = new SaleInputNormalizer();
  private readonly paymentPolicy = new SalePaymentPolicy();
  private readonly itemResolver: SaleItemResolver;
  private readonly pricingCalculator = new SalePricingCalculator();
  private readonly fiscalOrchestrator: SaleFiscalOrchestrator;
  private readonly persistenceAssembler = new SalePersistenceAssembler();
  private readonly inventoryPolicy: PostPersistenceInventoryPolicy;

  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly sales: SaleRepositoryPort,
    private readonly inventory: InventoryRepositoryPort,
    private readonly issueInvoice: IssueArcaInvoiceUseCase,
    private readonly promotionResolver: PromotionResolverService,
    @Optional() itemResolver?: SaleItemResolver,
    @Optional() fiscalOrchestrator?: SaleFiscalOrchestrator,
    @Optional() inventoryPolicy?: PostPersistenceInventoryPolicy,
  ) {
    this.itemResolver =
      itemResolver ??
      new SaleItemResolver(this.products, this.promotionResolver);
    this.fiscalOrchestrator =
      fiscalOrchestrator ??
      new SaleFiscalOrchestrator(this.issueInvoice);
    this.inventoryPolicy =
      inventoryPolicy ??
      new PostPersistenceInventoryPolicy(this.inventory);
  }

  async execute(input: CreateSaleInput): Promise<Sale> {
    const normalized = this.inputNormalizer.normalize(input);
    const paymentMethods = this.paymentPolicy.validate(normalized.paymentMethods);
    const resolved = await this.itemResolver.resolve(normalized);
    const pricing = this.pricingCalculator.price({
      resolved,
      manualDiscount: normalized.manualDiscount,
      invoiceRequested: normalized.invoiceRequested,
    });

    const fiscal = await this.fiscalOrchestrator.issueIfRequested({
      invoiceRequested: normalized.invoiceRequested,
      saleItems: pricing.saleItems,
      resolvedLines: resolved.lines,
      postPromotionSubtotal: pricing.postPromotionSubtotal,
      manualDiscountAmount: pricing.manualDiscount.amount,
    });

    const saleInput = this.persistenceAssembler.assemble({
      userId: normalized.userId,
      pricing,
      paymentMethods,
      splitTicketGroups: normalized.splitTicketGroups,
      fiscal,
    });

    const sale = await this.sales.create(saleInput);

    await this.inventoryPolicy.deductAfterSalePersisted({
      saleId: sale.id,
      lines: toInventoryDeductionLines(resolved.lines),
    });

    return sale;
  }
}
