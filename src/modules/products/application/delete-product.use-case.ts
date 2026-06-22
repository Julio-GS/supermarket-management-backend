import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "./product.repository.port";
import { NotFoundError } from "../../../shared/errors/domain.error";

@Injectable()
export class DeleteProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(id: string): Promise<void> {
    const existing = await this.products.findById(id);
    if (!existing) {
      throw new NotFoundError("Product not found");
    }
    await this.products.delete(id);
  }
}
