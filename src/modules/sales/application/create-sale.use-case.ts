import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { Product } from "../../products/domain/product.entity";
import { SaleRepositoryPort, SaleItemCreateData } from "./sale.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import {
  PromotionResolverService,
} from "../../promotions/application/promotion-resolver.service";
import {
  PAYMENT_METHODS,
  PaymentMethod,
  PaymentMethodAllocation,
  Sale,
  SaleItemSplitTicketInput,
  SaleSplitTicketGroupInput,
  SaleSplitTicketItemInput,
} from "../domain/sale.entity";
import {
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/domain.error";
import { Money } from "../../../shared/money/money.helper";

export interface CreateSaleItemInput extends SaleSplitTicketItemInput {
  line_total?: string;
  split_ticket?: SaleItemSplitTicketInput;
}

export interface CreateSaleInput {
  user_id: string;
  items: CreateSaleItemInput[];
  payment_methods: PaymentMethodAllocation[];
  split_ticket_groups?: SaleSplitTicketGroupInput[] | null;
  invoice_requested?: boolean;
}

const ALLOWED_PAYMENT_METHODS = new Set<PaymentMethod>(PAYMENT_METHODS);
const DEFAULT_SPLIT_GROUP_LABELS = ["A", "B"] as const;

function validatePaymentMethods(
  payment_methods: PaymentMethodAllocation[] | undefined,
): PaymentMethodAllocation[] {
  if (!Array.isArray(payment_methods) || payment_methods.length === 0) {
    throw new ValidationError("Sale must contain at least one payment method");
  }

  const methods = new Set<PaymentMethod>();

  for (const allocation of payment_methods) {
    if (!allocation.method || !ALLOWED_PAYMENT_METHODS.has(allocation.method)) {
      throw new ValidationError(`Unsupported payment method: ${allocation.method}`);
    }

    if (typeof allocation.amount !== "string" || allocation.amount === "") {
      throw new ValidationError(
        `Payment method ${allocation.method} must include a valid amount`,
      );
    }

    if (methods.has(allocation.method)) {
      throw new ValidationError("Sale payment methods must be unique");
    }

    methods.add(allocation.method);
  }

  return payment_methods;
}

function aggregateQuantities(
  items: SaleSplitTicketItemInput[],
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const item of items) {
    totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + item.quantity);
  }

  return totals;
}

function aggregateGroupQuantities(
  groups: SaleSplitTicketGroupInput[],
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const group of groups) {
    for (const item of group.items) {
      totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + item.quantity);
    }
  }

  return totals;
}

function normalizeExplicitSplitTicketGroups(
  groups: SaleSplitTicketGroupInput[] | undefined | null,
  itemTotals: Map<string, number>,
): SaleSplitTicketGroupInput[] {
  if (!Array.isArray(groups) || groups.length !== 2) {
    throw new ValidationError("Split ticket must contain exactly two groups");
  }

  const normalizedGroups = groups.map((group) => ({
    label: group.label.trim(),
    items: group.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
    })),
  }));

  if (normalizedGroups.some((group) => group.label.length === 0)) {
    throw new ValidationError("Split ticket group labels must not be empty");
  }

  if (new Set(normalizedGroups.map((group) => group.label)).size !== 2) {
    throw new ValidationError("Split ticket group labels must be unique");
  }

  const allocatedTotals = aggregateGroupQuantities(normalizedGroups);

  for (const productId of allocatedTotals.keys()) {
    if (!itemTotals.has(productId)) {
      throw new ValidationError(
        `Split ticket references unknown product ${productId}`,
      );
    }
  }

  for (const [productId, expectedQuantity] of itemTotals.entries()) {
    const allocatedQuantity = allocatedTotals.get(productId) ?? 0;
    if (allocatedQuantity !== expectedQuantity) {
      throw new ValidationError(
        `Split ticket allocation for product ${productId} must match the ordered quantity`,
      );
    }
  }

  if (normalizedGroups[0].items.length === 0 || normalizedGroups[1].items.length === 0) {
    throw new ValidationError("Split ticket groups must both contain allocations");
  }

  return normalizedGroups;
}

function normalizeItemSplitTicketGroups(
  items: CreateSaleItemInput[],
): SaleSplitTicketGroupInput[] {
  if (!items.every((item) => item.split_ticket)) {
    throw new ValidationError(
      "Sale split ticket input must define split_ticket for every item when using item splits",
    );
  }

  const groups: SaleSplitTicketGroupInput[] = [
    { label: DEFAULT_SPLIT_GROUP_LABELS[0], items: [] },
    { label: DEFAULT_SPLIT_GROUP_LABELS[1], items: [] },
  ];
  let hasGroupOneAllocations = false;
  let hasGroupTwoAllocations = false;

  for (const item of items) {
    const splitTicket = item.split_ticket!;

    if (
      !Number.isInteger(splitTicket.group_1_quantity) ||
      !Number.isInteger(splitTicket.group_2_quantity) ||
      splitTicket.group_1_quantity < 0 ||
      splitTicket.group_2_quantity < 0
    ) {
      throw new ValidationError(
        `Split ticket allocation for product ${item.product_id} must use non-negative integer quantities`,
      );
    }

    if (splitTicket.group_1_quantity + splitTicket.group_2_quantity !== item.quantity) {
      throw new ValidationError(
        `Split ticket allocation for product ${item.product_id} must match the item quantity`,
      );
    }

    if (splitTicket.group_1_quantity > 0) {
      groups[0].items.push({
        product_id: item.product_id,
        quantity: splitTicket.group_1_quantity,
      });
      hasGroupOneAllocations = true;
    }

    if (splitTicket.group_2_quantity > 0) {
      groups[1].items.push({
        product_id: item.product_id,
        quantity: splitTicket.group_2_quantity,
      });
      hasGroupTwoAllocations = true;
    }
  }

  if (!hasGroupOneAllocations || !hasGroupTwoAllocations) {
    throw new ValidationError("Split ticket groups must both contain allocations");
  }

  return groups;
}

function resolveSplitTicketGroups(
  items: CreateSaleItemInput[],
  split_ticket_groups: SaleSplitTicketGroupInput[] | null | undefined,
): SaleSplitTicketGroupInput[] | null {
  const hasExplicitGroups = split_ticket_groups !== undefined && split_ticket_groups !== null;
  const hasItemSplits = items.some((item) => item.split_ticket !== undefined);

  if (!hasExplicitGroups && !hasItemSplits) {
    return null;
  }

  if (hasExplicitGroups && hasItemSplits) {
    throw new ValidationError(
      "Sale split ticket input must use either split_ticket_groups or item split_ticket, not both",
    );
  }

  const itemTotals = aggregateQuantities(items);

  if (hasExplicitGroups) {
    return normalizeExplicitSplitTicketGroups(split_ticket_groups, itemTotals);
  }

  return normalizeItemSplitTicketGroups(items);
}

@Injectable()
export class CreateSaleUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly sales: SaleRepositoryPort,
    private readonly issueInvoice: IssueArcaInvoiceUseCase,
    private readonly promotionResolver: PromotionResolverService,
  ) {}

  async execute(input: CreateSaleInput): Promise<Sale> {
    if (!input.items || input.items.length === 0) {
      throw new ValidationError("Sale must contain at least one item");
    }

    const paymentMethods = validatePaymentMethods(input.payment_methods);
    const splitTicketGroups = resolveSplitTicketGroups(
      input.items,
      input.split_ticket_groups,
    );

    const invoiceRequested = input.invoice_requested ?? false;
    const saleItems: SaleItemCreateData[] = [];
    const loadedItems: { product: Product; quantity: number }[] = [];
    let total = Money.zero();

    const productIds = [...new Set(input.items.map((item) => item.product_id))];
    const productsById = new Map(
      (await this.products.findByIdsForSale(productIds)).map((product) => [
        product.id,
        product,
      ]),
    );

    // First pass: validate products and build per-item price data
    const resolutionItems: {
      productId: string;
      unitPrice: string;
      quantity: number;
    }[] = [];
    const manualItemIndices: number[] = [];

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      const product = productsById.get(item.product_id);
      if (!product) {
        throw new NotFoundError(`Product ${item.product_id} not found`);
      }

      const isManual = product.pricing_mode === "manual";

      if (isManual) {
        // Manual product: requires line_total, quantity must be 1
        if (item.quantity !== 1) {
          throw new ValidationError(
            `Special product ${product.detalle} only allows quantity 1`,
          );
        }
        if (!item.line_total || item.line_total === "") {
          throw new ValidationError(
            `Special product ${product.detalle} requires a line_total amount`,
          );
        }
        const lineTotal = Money.parse(item.line_total);
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
        if (item.line_total !== undefined && item.line_total !== null) {
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

    // Resolve promotions — skip manual items by passing null for their resolution
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
    for (let i = 0; i < input.items.length; i++) {
      const isManual = manualItemIndices.includes(i);
      const resItem = resolutionItems[i];
      const unitPrice = Money.parse(resItem.unitPrice);

      if (isManual) {
        // Manual product: subtotal = line_total, no discount, no promotions
        const subtotal = Money.toString(unitPrice);
        saleItems.push({
          product_id: resItem.productId,
          quantity: 1,
          unit_price: Money.toString(unitPrice),
          subtotal,
          discount_amount: "0.00",
          applied_promotions: [],
          applied_promotion_id: null,
          applied_promotion_type: null,
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

        saleItems.push({
          product_id: resItem.productId,
          quantity: resItem.quantity,
          unit_price: Money.toString(unitPrice),
          subtotal: Money.toString(discountedSubtotal),
          discount_amount: Money.toString(discountAmount),
          applied_promotions: resolved?.applied_promotions ?? [],
          applied_promotion_id: appliedPromotionId,
          applied_promotion_type: appliedPromotionType,
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

    if (invoiceRequested) {
      const invoiceItems = saleItems.map((si) => {
        const product = productsById.get(si.product_id);
        return {
          line_total: si.subtotal,
          iva_rate: product?.iva ?? "0",
        };
      });
      invoiceResult = await this.issueInvoice.issue(invoiceItems);
    }

    return this.sales.create({
      user_id: input.user_id,
      items: saleItems,
      payment_methods: paymentMethods,
      split_ticket_groups: splitTicketGroups,
      total: Money.toString(total),
      invoice_status: invoiceResult ? "issued" : "none",
      cae: invoiceResult?.cae ?? null,
      cae_vto: invoiceResult?.cae_vto ?? null,
      cbte_nro: invoiceResult?.cbte_nro ?? null,
      cbte_tipo: invoiceResult?.cbte_tipo ?? null,
      pto_vta: invoiceResult?.pto_vta ?? null,
      invoice_requested_at: invoiceResult ? new Date() : null,
    });
  }
}
