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

export {
  CreateManualDiscountInput,
  CreateSaleInput,
  CreateSaleItemInput,
};

function allocateManualDiscountAcrossInvoiceLines(
  lines: { line_total: string; iva_rate: string }[],
  subtotal: Decimal,
  discount: Decimal,
): { line_total: string; iva_rate: string }[] {
  if (discount.eq(0) || lines.length === 0) {
    return lines;
  }

  const finalTotal = subtotal.sub(discount);
  const adjusted: { line_total: string; iva_rate: string }[] = [];
  let allocated = Money.zero();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTotal = Money.parse(line.line_total);
    if (i === lines.length - 1) {
      const residual = finalTotal.sub(allocated);
      if (residual.lt(0)) {
        throw new ValidationError(
          "manual discount allocation produced a negative invoice line",
        );
      }
      adjusted.push({
        line_total: Money.toString(residual),
        iva_rate: line.iva_rate,
      });
    } else {
      const share = lineTotal
        .div(subtotal)
        .mul(discount)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const lineFinal = lineTotal.sub(share);
      allocated = allocated.add(lineFinal);
      adjusted.push({
        line_total: Money.toString(lineFinal),
        iva_rate: line.iva_rate,
      });
    }
  }

  return adjusted;
}

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

  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly sales: SaleRepositoryPort,
    private readonly inventory: InventoryRepositoryPort,
    private readonly issueInvoice: IssueArcaInvoiceUseCase,
    private readonly promotionResolver: PromotionResolverService,
    @Optional() itemResolver?: SaleItemResolver,
  ) {
    this.itemResolver =
      itemResolver ??
      new SaleItemResolver(this.products, this.promotionResolver);
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

    let invoiceResult: {
      cae: string;
      cae_vto: string;
      cbte_nro: number;
      cbte_tipo: number;
      pto_vta: number;
    } | null = null;

    if (invoiceRequested) {
      const invoiceItems = saleItems.map((si, idx) => {
        const line = resolved.lines[idx];
        if (si.iva) {
          return { line_total: si.subtotal, iva_rate: si.iva };
        }
        return {
          line_total: si.subtotal,
          iva_rate: (line.kind !== "ad-hoc" ? line.product.iva : null) ?? "0",
        };
      });

      const adjustedInvoiceItems = allocateManualDiscountAcrossInvoiceLines(
        invoiceItems,
        postPromotionSubtotal,
        manualDiscount.amount,
      );

      try {
        invoiceResult = await this.issueInvoice.issue(adjustedInvoiceItems);
      } catch (error) {
        this.logger.error(
          `ARCA invoice issuance failed; checkout will complete without fiscal invoice`,
          error instanceof Error ? error.stack : undefined,
        );
        // invoiceResult remains null — sale persists with 'failed' status
      }
    }

    const invoiceStatus: InvoiceStatus = invoiceResult
      ? "issued"
      : invoiceRequested
        ? "failed"
        : "none";
    const invoiceRequestedAt = invoiceRequested ? new Date() : null;

    const sale = await this.sales.create({
      user_id: normalized.userId,
      items: saleItems,
      payment_methods: paymentMethods,
      split_ticket_groups: splitTicketGroups,
      total: Money.toString(finalTotal),
      manual_discount_amount: Money.toString(manualDiscount.amount),
      manual_discount_modality: manualDiscount.modality,
      manual_discount_percentage: manualDiscount.percentage,
      invoice_status: invoiceStatus,
      cae: invoiceResult?.cae ?? null,
      cae_vto: invoiceResult?.cae_vto ?? null,
      cbte_nro: invoiceResult?.cbte_nro ?? null,
      cbte_tipo: invoiceResult?.cbte_tipo ?? null,
      pto_vta: invoiceResult?.pto_vta ?? null,
      invoice_requested_at: invoiceRequestedAt,
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
