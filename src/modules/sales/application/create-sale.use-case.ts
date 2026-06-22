import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { Product } from "../../products/domain/product.entity";
import { SaleRepositoryPort, SaleItemCreateData } from "./sale.repository.port";
import { IssueArcaInvoiceUseCase } from "./issue-arca-invoice.use-case";
import { Sale } from "../domain/sale.entity";
import {
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/domain.error";
import { Money } from "../../../shared/money/money.helper";

export interface CreateSaleInput {
  user_id: string;
  items: { product_id: string; quantity: number }[];
  invoice_requested?: boolean;
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

    const invoiceRequested = input.invoice_requested ?? false;
    const saleItems: SaleItemCreateData[] = [];
    const loadedItems: { product: Product; quantity: number }[] = [];
    let total = Money.zero();

    for (const item of input.items) {
      const product = await this.products.findById(item.product_id);
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
