import { Product } from "../domain/product.entity";
import { PricingMode } from "../domain/special-product-codes";
import { Page, PaginationOptions } from "../../../shared/read-model/page";
import { QueryRunner } from "typeorm";

export interface ProductListOptions {
  search?: string;
}

export type ProductReadOptions = PaginationOptions;

export interface ProductCreateInput {
  detalle: string;
  costo_neto?: string | null;
  costo_final?: string | null;
  iva?: string | null;
  cambio_costo: string;
  cambio_precio: string;
  etiqueta: string;
  facturable: boolean;
  maneja_stock: boolean;
  codigos: string[];
  pricing_mode?: PricingMode;
  is_protected?: boolean;
}

export interface ProductUpdateInput {
  detalle?: string;
  costo_neto?: string | null;
  costo_final?: string | null;
  iva?: string | null;
  cambio_costo?: string;
  cambio_precio?: string;
  etiqueta?: string;
  facturable?: boolean;
  maneja_stock?: boolean;
  codigos?: string[];
  pricing_mode?: PricingMode;
  is_protected?: boolean;
}

export abstract class ProductRepositoryPort {
  abstract create(
    input: ProductCreateInput,
    runner?: QueryRunner,
  ): Promise<Product>;
  abstract findAll(options?: ProductListOptions): Promise<Product[]>;
  abstract findPage(options: ProductReadOptions): Promise<Page<Product>>;
  abstract findById(id: string): Promise<Product | null>;
  abstract findByIdsForSale(ids: string[]): Promise<Product[]>;
  abstract findByBarcode(codigo: string): Promise<Product | null>;
  abstract findByCode(code: string): Promise<Product | null>;
  abstract update(
    id: string,
    input: ProductUpdateInput,
    runner?: QueryRunner,
  ): Promise<Product | null>;
  abstract delete(id: string): Promise<void>;
  abstract existsAnyBarcode(
    codigos: string[],
    excludeProductId?: string,
  ): Promise<boolean>;
}
