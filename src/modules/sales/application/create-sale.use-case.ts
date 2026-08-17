import { Injectable, Logger } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { Product } from "../../products/domain/product.entity";
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
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/domain.error";
import { Money } from "../../../shared/money/money.helper";
import {
  AdHocSaleItemInput,
  CatalogReferenceSaleItemInput,
  CreateManualDiscountInput,
  CreateSaleInput,
  CreateSaleItemInput,
} from "./create-sale.types";
import { SaleInputNormalizer } from "./sale-input-normalizer";
import { SalePaymentPolicy } from "./sale-payment-policy";

export {
  CreateManualDiscountInput,
  CreateSaleInput,
  CreateSaleItemInput,
};

const AD_HOC_IVA_RATE = "21.00";

interface ResolvedManualDiscount {
  amount: Decimal;
  modality: ManualDiscountModality | null;
  percentage: string | null;
}

function requireMoney(value: string | undefined, message: string): Decimal {
  if (typeof value !== "string" || value === "") {
    throw new ValidationError(message);
  }
  return Money.parse(value);
}

function resolveManualDiscount(
  input: CreateManualDiscountInput | null | undefined,
  subtotal: Decimal,
): ResolvedManualDiscount {
  if (!input) {
    return { amount: Money.zero(), modality: null, percentage: null };
  }

  const amount = requireMoney(input.amount, "manual discount amount is required");
  if (amount.lt(0)) {
    throw new ValidationError("discount must be non-negative");
  }

  if (input.modality === "fixed") {
    if (amount.gt(subtotal)) {
      throw new ValidationError("discount exceeds subtotal");
    }
    if (amount.eq(0)) {
      return { amount: Money.zero(), modality: null, percentage: null };
    }
    return { amount, modality: "fixed", percentage: null };
  }

  const percentage = requireMoney(
    input.percentage,
    "manual discount percentage is required",
  );
  if (percentage.lt(0) || percentage.gt(100)) {
    throw new ValidationError("percentage must be between 0 and 100");
  }

  const expected = subtotal
    .mul(percentage)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  if (expected.sub(amount).abs().gt(0.01)) {
    throw new ValidationError("percentage amount mismatch");
  }
  if (expected.gt(subtotal)) {
    throw new ValidationError("discount exceeds subtotal");
  }
  if (expected.eq(0)) {
    return { amount: Money.zero(), modality: null, percentage: null };
  }
  return {
    amount: expected,
    modality: "percentage",
    percentage: Money.toString(percentage),
  };
}

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

  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly sales: SaleRepositoryPort,
    private readonly inventory: InventoryRepositoryPort,
    private readonly issueInvoice: IssueArcaInvoiceUseCase,
    private readonly promotionResolver: PromotionResolverService,
  ) {}

  async execute(input: CreateSaleInput): Promise<Sale> {
    const normalized = this.inputNormalizer.normalize(input);
    const paymentMethods = this.paymentPolicy.validate(normalized.paymentMethods);
    const splitTicketGroups = normalized.splitTicketGroups;
    const invoiceRequested = normalized.invoiceRequested;

    const saleItems: SaleItemCreateData[] = [];
    const loadedItems: { product: Product; quantity: number }[] = [];
    let total = Money.zero();

    // Only look up catalog product IDs (skip synthetic ad-hoc IDs)
    const catalogProductIds = [
      ...new Set(
        normalized.items
          .filter(
            (item): item is CatalogReferenceSaleItemInput =>
              item.kind === "catalog-reference",
          )
          .map((item) => item.productId),
      ),
    ];
    const productsById = new Map(
      catalogProductIds.length > 0
        ? (await this.products.findByIdsForSale(catalogProductIds)).map((product) => [
            product.id,
            product,
          ])
        : [],
    );

    // First pass: validate products and build per-item price data
    const resolutionItems: {
      productId: string;
      unitPrice: string;
      quantity: number;
    }[] = [];
    const manualItemIndices: number[] = [];

    for (let i = 0; i < normalized.items.length; i++) {
      const item = normalized.items[i];

      if (item.kind === "ad-hoc") {
        // --- Ad-hoc item ---
        const unitPrice = Money.parse(item.unitPrice);

        // Ad-hoc items are always facturable with fixed 21% IVA
        if (invoiceRequested) {
          // Ad-hoc items are always facturable — no product.facturable check needed
        }

        // Ad-hoc items skip product-level promotion resolution but are
        // included so store-wide promotions can apply
        resolutionItems.push({
          productId: item.syntheticProductId,
          unitPrice: Money.toString(unitPrice),
          quantity: item.quantity,
        });

        continue;
      }

      const product = productsById.get(item.productId);
      if (!product) {
        throw new NotFoundError(`Product ${item.productId} not found`);
      }

      const isManual = product.pricing_mode === "manual";

      if (isManual) {
        // Manual product: requires line_total, quantity must be 1
        if (item.quantity !== 1) {
          throw new ValidationError(
            `Special product ${product.detalle} only allows quantity 1`,
          );
        }
        if (!item.lineTotal || item.lineTotal === "") {
          throw new ValidationError(
            `Special product ${product.detalle} requires a line_total amount`,
          );
        }
        const lineTotal = Money.parse(item.lineTotal);
        if (lineTotal.lte(0)) {
          throw new ValidationError(
            `Special product ${product.detalle} requires a positive line_total`,
          );
        }

        if (invoiceRequested && !product.facturable) {
          throw new ValidationError(
            `Product ${product.detalle} (${product.id}) is not facturable and cannot be invoiced`,
          );
        }

        // Manual products skip promotion resolution (null entry)
        resolutionItems.push({
          productId: product.id,
          unitPrice: Money.toString(lineTotal),
          quantity: 1,
        });
        manualItemIndices.push(i);

        loadedItems.push({ product, quantity: 1 });
      } else {
        // Fixed product: requires catalog price, rejects line_total override
        if (item.lineTotal !== undefined && item.lineTotal !== null) {
          throw new ValidationError(
            `Product ${product.detalle} has a fixed price; line_total is not allowed`,
          );
        }

        if (invoiceRequested && !product.facturable) {
          throw new ValidationError(
            `Product ${product.detalle} (${product.id}) is not facturable and cannot be invoiced`,
          );
        }

        if (product.costo_final === null) {
          throw new ValidationError(
            `Product ${product.detalle} has no catalog price defined`,
          );
        }

        const unitPrice = Money.parse(product.costo_final);
        resolutionItems.push({
          productId: product.id,
          unitPrice: Money.toString(unitPrice),
          quantity: item.quantity,
        });

        loadedItems.push({ product, quantity: item.quantity });
      }
    }

    // Resolve promotions — skip manual items, but include ad-hoc items
    // (ad-hoc items get store promotions; product promotions won't match synthetic IDs)
    const fixedResolutionItems = resolutionItems.map((ri, idx) =>
      manualItemIndices.includes(idx) ? null : ri,
    );
    const resolvedPromotions =
      await this.promotionResolver.resolveForSaleItems(
        fixedResolutionItems.filter((r): r is NonNullable<typeof r> => r !== null),
      );

    // Build a resolved-promotions map keyed by original index
    const resolvedByIndex = new Map<
      number,
      (typeof resolvedPromotions)[number] | null
    >();
    let promoIdx = 0;
    for (let i = 0; i < resolutionItems.length; i++) {
      if (manualItemIndices.includes(i)) {
        resolvedByIndex.set(i, null);
      } else {
        resolvedByIndex.set(i, resolvedPromotions[promoIdx++] ?? null);
      }
    }

    // Second pass: build sale items
    for (let i = 0; i < normalized.items.length; i++) {
      const item = normalized.items[i];
      const isAdHoc = item.kind === "ad-hoc";
      const isManual = manualItemIndices.includes(i);
      const resItem = resolutionItems[i];
      const unitPrice = Money.parse(resItem.unitPrice);

      if (isAdHoc) {
        // Ad-hoc item: subtotal = unit_price × quantity, with promotions from store scope
        const grossSubtotal = Money.multiply(unitPrice, resItem.quantity);
        let discountAmount = Money.zero();
        let appliedPromotionId: string | null = null;
        let appliedPromotionType: string | null = null;

        const resolved = resolvedByIndex.get(i) ?? null;
        if (resolved) {
          discountAmount = Money.parse(resolved.discountAmount);
          appliedPromotionId = resolved.promotionId;
          appliedPromotionType = resolved.type;
        }

        // Filter out product-scoped promotions; ad-hoc items only receive store promotions
        const storePromotions = (resolved?.applied_promotions ?? []).filter(
          (p) => p.promotion_scope === "store",
        );
        let storeDiscountTotal = Money.zero();
        for (const p of storePromotions) {
          storeDiscountTotal = Money.add(storeDiscountTotal, Money.parse(p.discount_amount));
        }
        const storeDiscountAmount = Money.toString(storeDiscountTotal);

        const discountedSubtotal = Money.subtract(grossSubtotal, storeDiscountTotal);

        saleItems.push({
          product_id: resItem.productId,
          name: item.name ?? null,
          description: item.description ?? null,
          iva: AD_HOC_IVA_RATE,
          quantity: resItem.quantity,
          unit_price: Money.toString(unitPrice),
          subtotal: Money.toString(discountedSubtotal),
          discount_amount: storeDiscountAmount,
          applied_promotions: storePromotions,
          applied_promotion_id: appliedPromotionId,
          applied_promotion_type: appliedPromotionType,
        });
        total = Money.add(total, discountedSubtotal);
      } else if (isManual) {
        // Manual product: subtotal = line_total, no discount, no promotions
        const subtotal = Money.toString(unitPrice);
        const manualProductIva = productsById.get(resItem.productId)?.iva ?? null;
        saleItems.push({
          product_id: resItem.productId,
          quantity: 1,
          unit_price: Money.toString(unitPrice),
          subtotal,
          discount_amount: "0.00",
          applied_promotions: [],
          applied_promotion_id: null,
          applied_promotion_type: null,
          ...(invoiceRequested && manualProductIva ? { iva: manualProductIva } : {}),
        });
        total = Money.add(total, unitPrice);
      } else {
        const grossSubtotal = Money.multiply(unitPrice, resItem.quantity);
        let discountAmount = Money.zero();
        let appliedPromotionId: string | null = null;
        let appliedPromotionType: string | null = null;

        const resolved = resolvedByIndex.get(i) ?? null;
        if (resolved) {
          discountAmount = Money.parse(resolved.discountAmount);
          appliedPromotionId = resolved.promotionId;
          appliedPromotionType = resolved.type;
        }

        const discountedSubtotal = Money.subtract(grossSubtotal, discountAmount);

        // Snapshot product IVA for invoice-requested catalog items so fiscal retry
        // can reconstruct the same invoice basis from persisted sale data.
        const productIva = productsById.get(resItem.productId)?.iva ?? null;

        saleItems.push({
          product_id: resItem.productId,
          quantity: resItem.quantity,
          unit_price: Money.toString(unitPrice),
          subtotal: Money.toString(discountedSubtotal),
          discount_amount: Money.toString(discountAmount),
          applied_promotions: resolved?.applied_promotions ?? [],
          applied_promotion_id: appliedPromotionId,
          applied_promotion_type: appliedPromotionType,
          ...(invoiceRequested && productIva ? { iva: productIva } : {}),
        });

        total = Money.add(total, discountedSubtotal);
      }
    }

    let invoiceResult: {
      cae: string;
      cae_vto: string;
      cbte_nro: number;
      cbte_tipo: number;
      pto_vta: number;
    } | null = null;

    const postPromotionSubtotal = total;
    const manualDiscount = resolveManualDiscount(
      normalized.manualDiscount,
      postPromotionSubtotal,
    );
    const finalTotal = Money.subtract(postPromotionSubtotal, manualDiscount.amount);
    if (finalTotal.lt(0)) {
      throw new ValidationError("discount exceeds subtotal");
    }

    if (invoiceRequested) {
      const invoiceItems = saleItems.map((si) => {
        // Ad-hoc items carry their own iva_rate; catalog items use the product's iva
        if (si.iva) {
          return { line_total: si.subtotal, iva_rate: si.iva };
        }
        const product = productsById.get(si.product_id!);
        return {
          line_total: si.subtotal,
          iva_rate: product?.iva ?? "0",
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
    for (let i = 0; i < normalized.items.length; i++) {
      const item = normalized.items[i];
      if (item.kind === "ad-hoc") continue;
      const product = productsById.get(item.productId);
      if (!product || !product.maneja_stock) continue;
      const current = managedDeductions.get(product.id) ?? 0;
      managedDeductions.set(product.id, current + item.quantity);
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
