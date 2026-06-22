import { Product } from "../domain/product.entity";

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
  abstract findAll(): Promise<Product[]>;
  abstract findById(id: string): Promise<Product | null>;
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
