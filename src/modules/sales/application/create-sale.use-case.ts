import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { Product } from "../../products/domain/product.entity";
import { SaleRepositoryPort, SaleItemCreateData } from "./sale.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import {
  PAYMENT_METHODS,
  PaymentMethod,
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
  split_ticket?: SaleItemSplitTicketInput;
}

export interface CreateSaleInput {
  user_id: string;
  items: CreateSaleItemInput[];
  payment_methods: PaymentMethod[];
  split_ticket_groups?: SaleSplitTicketGroupInput[] | null;
  invoice_requested?: boolean;
}

const ALLOWED_PAYMENT_METHODS = new Set<PaymentMethod>(PAYMENT_METHODS);
const DEFAULT_SPLIT_GROUP_LABELS = ["A", "B"] as const;

function validatePaymentMethods(
  payment_methods: PaymentMethod[] | undefined,
): PaymentMethod[] {
  if (!Array.isArray(payment_methods) || payment_methods.length === 0) {
    throw new ValidationError("Sale must contain at least one payment method");
  }

  for (const method of payment_methods) {
    if (!ALLOWED_PAYMENT_METHODS.has(method)) {
      throw new ValidationError(`Unsupported payment method: ${method}`);
    }
  }

  if (new Set(payment_methods).size !== payment_methods.length) {
    throw new ValidationError("Sale payment methods must be unique");
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

    for (const item of input.items) {
      const product = productsById.get(item.product_id);
      if (!product) {
        throw new NotFoundError(`Product ${item.product_id} not found`);
      }

      if (invoiceRequested && !product.facturable) {
        throw new ValidationError(
          `Product ${product.detalle} (${product.id}) is not facturable and cannot be invoiced`,
        );
      }

      const unitPrice = Money.parse(product.costo_final);
      const subtotal = Money.multiply(unitPrice, item.quantity);

      saleItems.push({
        product_id: product.id,
        quantity: item.quantity,
        unit_price: Money.toString(unitPrice),
        subtotal: Money.toString(subtotal),
      });

      total = Money.add(total, subtotal);
      loadedItems.push({
        product: product as Product,
        quantity: item.quantity,
      });
    }

    let invoiceResult: {
      cae: string;
      cae_vto: string;
      cbte_nro: number;
      cbte_tipo: number;
      pto_vta: number;
    } | null = null;

    if (invoiceRequested) {
      invoiceResult = await this.issueInvoice.issue(
        loadedItems.map((i) => ({
          product: i.product,
          quantity: i.quantity,
        })),
      );
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
