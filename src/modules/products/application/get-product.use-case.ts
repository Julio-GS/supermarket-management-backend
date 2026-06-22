import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "./product.repository.port";
import { Product } from "../domain/product.entity";
import { NotFoundError } from "../../../shared/errors/domain.error";

@Injectable()
export class GetProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }
}
