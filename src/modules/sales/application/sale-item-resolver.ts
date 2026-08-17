import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { Product } from "../../products/domain/product.entity";
import {
  PromotionResolverService,
  SaleItemForResolution,
} from "../../promotions/application/promotion-resolver.service";
import {
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/domain.error";
import { Money } from "../../../shared/money/money.helper";
import {
  CatalogReferenceSaleItemInput,
  NormalizedSaleRequest,
  PromotionResolutionResult,
  ResolvedSaleLine,
  ResolvedSaleLines,
} from "./create-sale.types";

@Injectable()
export class SaleItemResolver {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly promotionResolver: PromotionResolverService,
  ) {}

  async resolve(request: NormalizedSaleRequest): Promise<ResolvedSaleLines> {
    const catalogProductIds = [
      ...new Set(
        request.items
          .filter(
            (item): item is CatalogReferenceSaleItemInput =>
              item.kind === "catalog-reference",
          )
          .map((item) => item.productId),
      ),
    ];

    const productsById = new Map<string, Product>(
      catalogProductIds.length > 0
        ? (await this.products.findByIdsForSale(catalogProductIds)).map((product) => [
            product.id,
            product,
          ])
        : [],
    );

    const lines: ResolvedSaleLine[] = [];

    for (const item of request.items) {
      if (item.kind === "ad-hoc") {
        const unitPrice = Money.parse(item.unitPrice);
        lines.push({
          kind: "ad-hoc",
          lineId: item.syntheticProductId,
          originalIndex: item.originalIndex,
          adHoc: {
            name: item.name,
            description: item.description,
          },
          quantity: item.quantity,
          unitPrice: Money.toString(unitPrice),
          promotionEligible: true,
          stockManaged: false,
          facturable: true,
          ivaForPersistence: "21.00",
          ...(item.splitTicket ? { splitTicket: item.splitTicket } : {}),
        });
        continue;
      }

      const product = productsById.get(item.productId);
      if (!product) {
        throw new NotFoundError(`Product ${item.productId} not found`);
      }

      const isManual = product.pricing_mode === "manual";

      if (isManual) {
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

        if (request.invoiceRequested && !product.facturable) {
          throw new ValidationError(
            `Product ${product.detalle} (${product.id}) is not facturable and cannot be invoiced`,
          );
        }

        lines.push({
          kind: "catalog-manual",
          lineId: product.id,
          originalIndex: item.originalIndex,
          product,
          quantity: 1,
          unitPrice: Money.toString(lineTotal),
          lineTotal: Money.toString(lineTotal),
          promotionEligible: false,
          stockManaged: product.maneja_stock,
          facturable: product.facturable,
          ivaForPersistence:
            request.invoiceRequested && product.iva ? product.iva : null,
          ...(item.splitTicket ? { splitTicket: item.splitTicket } : {}),
        });
      } else {
        if (item.lineTotal !== undefined && item.lineTotal !== null) {
          throw new ValidationError(
            `Product ${product.detalle} has a fixed price; line_total is not allowed`,
          );
        }

        if (request.invoiceRequested && !product.facturable) {
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
        lines.push({
          kind: "catalog-fixed",
          lineId: product.id,
          originalIndex: item.originalIndex,
          product,
          quantity: item.quantity,
          unitPrice: Money.toString(unitPrice),
          promotionEligible: true,
          stockManaged: product.maneja_stock,
          facturable: product.facturable,
          ivaForPersistence:
            request.invoiceRequested && product.iva ? product.iva : null,
          ...(item.splitTicket ? { splitTicket: item.splitTicket } : {}),
        });
      }
    }

    const eligibleLines = lines.filter((line) => line.promotionEligible);
    const promotionInputs: SaleItemForResolution[] = eligibleLines.map((line) => ({
      productId: line.lineId,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    }));

    const resolvedPromotions =
      await this.promotionResolver.resolveForSaleItems(promotionInputs);

    const promotionsByLineId = new Map<string, PromotionResolutionResult | null>();
    const promotionsByOriginalIndex = new Map<number, PromotionResolutionResult | null>();

    let promoIdx = 0;
    for (const line of lines) {
      if (line.promotionEligible) {
        const promo = resolvedPromotions[promoIdx++] ?? null;
        promotionsByLineId.set(line.lineId, promo);
        promotionsByOriginalIndex.set(line.originalIndex, promo);
      } else {
        promotionsByLineId.set(line.lineId, null);
        promotionsByOriginalIndex.set(line.originalIndex, null);
      }
    }

    return {
      lines,
      promotionsByLineId,
      promotionsByOriginalIndex,
    };
  }
}
