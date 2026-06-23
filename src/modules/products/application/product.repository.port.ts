import { Product } from "../domain/product.entity";
import { Page, PaginationOptions } from "../../../shared/read-model/page";

export interface ProductListOptions {
  search?: string;
}

export type ProductReadOptions = PaginationOptions;

export interface ProductCreateInput {
  detalle: string;
  costo_neto: string;
  costo_final: string;
  iva: string;
  cambio_costo: string;
  cambio_precio: string;
  etiqueta: string;
  facturable: boolean;
  maneja_stock: boolean;
  codigos: string[];
}

export interface ProductUpdateInput {
  detalle?: string;
  costo_neto?: string;
  costo_final?: string;
  iva?: string;
  cambio_costo?: string;
  cambio_precio?: string;
  etiqueta?: string;
  facturable?: boolean;
  maneja_stock?: boolean;
  codigos?: string[];
}

export abstract class ProductRepositoryPort {
  abstract create(input: ProductCreateInput): Promise<Product>;
  abstract findAll(options?: ProductListOptions): Promise<Product[]>;
  abstract findPage(options: ProductReadOptions): Promise<Page<Product>>;
  abstract findById(id: string): Promise<Product | null>;
  abstract findByIdsForSale(ids: string[]): Promise<Product[]>;
  abstract findByBarcode(codigo: string): Promise<Product | null>;
  abstract update(
    id: string,
    input: ProductUpdateInput,
  ): Promise<Product | null>;
  abstract delete(id: string): Promise<void>;
  abstract existsAnyBarcode(
    codigos: string[],
    excludeProductId?: string,
  ): Promise<boolean>;
}
