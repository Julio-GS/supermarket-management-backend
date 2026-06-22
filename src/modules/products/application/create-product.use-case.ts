import { Injectable } from "@nestjs/common";
import {
  ProductRepositoryPort,
  ProductCreateInput,
} from "./product.repository.port";
import { Product } from "../domain/product.entity";
import { ConflictError } from "../../../shared/errors/domain.error";

@Injectable()
export class CreateProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(input: ProductCreateInput): Promise<Product> {
    const hasDuplicates = await this.products.existsAnyBarcode(input.codigos);
    if (hasDuplicates) {
      throw new ConflictError("One or more barcodes already exist");
    }
    return this.products.create(input);
  }
}
