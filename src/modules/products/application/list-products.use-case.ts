import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "./product.repository.port";
import { Product } from "../domain/product.entity";

@Injectable()
export class ListProductsUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(): Promise<Product[]> {
    return this.products.findAll();
  }
}
