import { randomUUID } from "crypto";
import { ValidationError } from "../../../shared/errors/domain.error";
import { Money } from "../../../shared/money/money.helper";
import { SaleSplitTicketGroupInput } from "../domain/sale.entity";
import {
  CreateSaleInput,
  NormalizedSaleItem,
  NormalizedSaleRequest,
} from "./create-sale.types";

const DEFAULT_SPLIT_GROUP_LABELS = ["A", "B"] as const;

function aggregateQuantities(
  items: { productId: string; quantity: number }[],
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const item of items) {
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
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
  items: NormalizedSaleItem[],
): SaleSplitTicketGroupInput[] {
  if (!items.every((item) => item.splitTicket)) {
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
    const productId =
      item.kind === "catalog-reference"
        ? item.productId
        : item.syntheticProductId;
    const splitTicket = item.splitTicket!;

    if (
      !Number.isInteger(splitTicket.group_1_quantity) ||
      !Number.isInteger(splitTicket.group_2_quantity) ||
      splitTicket.group_1_quantity < 0 ||
      splitTicket.group_2_quantity < 0
    ) {
      throw new ValidationError(
        `Split ticket allocation for product ${productId} must use non-negative integer quantities`,
      );
    }

    if (splitTicket.group_1_quantity + splitTicket.group_2_quantity !== item.quantity) {
      throw new ValidationError(
        `Split ticket allocation for product ${productId} must match the item quantity`,
      );
    }

    if (splitTicket.group_1_quantity > 0) {
      groups[0].items.push({
        product_id: productId,
        quantity: splitTicket.group_1_quantity,
      });
      hasGroupOneAllocations = true;
    }

    if (splitTicket.group_2_quantity > 0) {
      groups[1].items.push({
        product_id: productId,
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
  items: NormalizedSaleItem[],
  splitTicketGroups: SaleSplitTicketGroupInput[] | null | undefined,
): SaleSplitTicketGroupInput[] | null {
  const hasExplicitGroups = splitTicketGroups !== undefined && splitTicketGroups !== null;
  const hasItemSplits = items.some((item) => item.splitTicket !== undefined);

  if (!hasExplicitGroups && !hasItemSplits) {
    return null;
  }

  if (hasExplicitGroups && hasItemSplits) {
    throw new ValidationError(
      "Sale split ticket input must use either split_ticket_groups or item split_ticket, not both",
    );
  }

  const itemTotals = aggregateQuantities(
    items.map((item) => ({
      productId:
        item.kind === "catalog-reference"
          ? item.productId
          : item.syntheticProductId,
      quantity: item.quantity,
    })),
  );

  if (hasExplicitGroups) {
    return normalizeExplicitSplitTicketGroups(splitTicketGroups, itemTotals);
  }

  return normalizeItemSplitTicketGroups(items);
}

export class SaleInputNormalizer {
  normalize(
    input: CreateSaleInput,
    uuid: () => string = randomUUID,
  ): NormalizedSaleRequest {
    if (!input.items || input.items.length === 0) {
      throw new ValidationError("Sale must contain at least one item");
    }

    const normalizedItems: NormalizedSaleItem[] = [];

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];

      if (!item.product_id) {
        if (!item.name || item.name.trim() === "") {
          throw new ValidationError("Ad-hoc sale items require a name");
        }
        if (!item.unit_price || item.unit_price === "") {
          throw new ValidationError("Ad-hoc sale items require a unit_price");
        }
        const price = Money.parse(item.unit_price);
        if (price.lte(0)) {
          throw new ValidationError("Ad-hoc sale items require a positive unit_price");
        }

        normalizedItems.push({
          kind: "ad-hoc",
          originalIndex: i,
          syntheticProductId: uuid(),
          name: item.name,
          description: item.description ?? null,
          unitPrice: item.unit_price,
          quantity: item.quantity,
          splitTicket: item.split_ticket,
        });
      } else {
        normalizedItems.push({
          kind: "catalog-reference",
          originalIndex: i,
          productId: item.product_id,
          quantity: item.quantity,
          lineTotal: item.line_total,
          splitTicket: item.split_ticket,
        });
      }
    }

    const splitTicketGroups = resolveSplitTicketGroups(
      normalizedItems,
      input.split_ticket_groups,
    );

    return {
      userId: input.user_id,
      items: normalizedItems,
      paymentMethods: input.payment_methods,
      splitTicketGroups,
      invoiceRequested: input.invoice_requested ?? false,
      manualDiscount: input.manual_discount,
    };
  }
}
