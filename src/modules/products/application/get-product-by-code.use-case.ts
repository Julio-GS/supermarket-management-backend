import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "./product.repository.port";
import { Product } from "../domain/product.entity";
import { NotFoundError } from "../../../shared/errors/domain.error";

@Injectable()
export class GetProductByCodeUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(code: string): Promise<Product> {
    const product = await this.products.findByBarcode(code);
    if (!product) {
      throw new NotFoundError(`Product with code ${code} not found`);
    }
    return product;
  }
}
