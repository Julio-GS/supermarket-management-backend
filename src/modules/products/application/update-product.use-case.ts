import { Injectable } from "@nestjs/common";
import {
  ProductRepositoryPort,
  ProductUpdateInput,
} from "./product.repository.port";
import { Product } from "../domain/product.entity";
import {
  NotFoundError,
  ConflictError,
} from "../../../shared/errors/domain.error";

@Injectable()
export class UpdateProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(id: string, input: ProductUpdateInput): Promise<Product> {
    const existing = await this.products.findById(id);
    if (!existing) {
      throw new NotFoundError("Product not found");
    }

    if (input.codigos && input.codigos.length > 0) {
      const hasDuplicates = await this.products.existsAnyBarcode(
        input.codigos,
        id,
      );
      if (hasDuplicates) {
        throw new ConflictError("One or more barcodes already exist");
      }
    }

    const updated = await this.products.update(id, input);
    if (!updated) {
      throw new NotFoundError("Product not found");
    }
    return updated;
  }
}
