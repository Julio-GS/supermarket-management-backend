import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository, SelectQueryBuilder } from "typeorm";
import {
  ProductRepositoryPort,
  ProductCreateInput,
  ProductUpdateInput,
  ProductReadOptions,
  ProductListOptions,
} from "../application/product.repository.port";
import { Product } from "../domain/product.entity";
import { ProductEntity } from "./typeorm-product.entity";
import { ProductBarcodeEntity } from "./typeorm-product-barcode.entity";
import { createPage, Page } from "../../../shared/read-model/page";
import {
  offsetFor,
  parseSort,
} from "../../../shared/read-model/pagination.dto";
import { productProjection } from "../../../shared/read-model/projection";

const PRODUCT_SORT_FIELDS = [
  "detalle",
  "created_at",
  "updated_at",
  "costo_final",
] as const;

@Injectable()
export class TypeOrmProductRepository extends ProductRepositoryPort {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(ProductBarcodeEntity)
    private readonly barcodeRepo: Repository<ProductBarcodeEntity>,
  ) {
    super();
  }

  async create(input: ProductCreateInput): Promise<Product> {
    const entity = this.productRepo.create({
      ...input,
      barcodes: input.codigos.map((codigo) => ({ codigo })),
    });
    const saved = await this.productRepo.save(entity);
    return this.toDomain(saved);
  }

  async findAll(options: ProductListOptions = {}): Promise<Product[]> {
    const qb = this.createListQuery(options.search).orderBy(
      "product.created_at",
      "DESC",
    );
    const entities = await qb.getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async findPage(options: ProductReadOptions): Promise<Page<Product>> {
    const sort = parseSort(options.sort, PRODUCT_SORT_FIELDS, {
      field: "created_at",
      direction: "DESC",
    });
    const [entities, total] = await this.createListQuery(options.search)
      .orderBy(`product.${sort.field}`, sort.direction)
      .skip(offsetFor(options))
      .take(options.limit)
      .getManyAndCount();

    return createPage(
      entities.map((e) => this.toDomain(e)),
      total,
      options,
    );
  }

  async findById(id: string): Promise<Product | null> {
    const entity = await this.productRepo.findOne({
      where: { id },
      relations: ["barcodes"],
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdsForSale(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    const entities = await this.productRepo.find({
      where: { id: In(ids) },
      relations: ["barcodes"],
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findByBarcode(codigo: string): Promise<Product | null> {
    const barcode = await this.barcodeRepo.findOne({
      where: { codigo },
      relations: ["product", "product.barcodes"],
    });
    return barcode?.product ? this.toDomain(barcode.product) : null;
  }

  async update(id: string, input: ProductUpdateInput): Promise<Product | null> {
    const existing = await this.productRepo.findOne({
      where: { id },
      relations: ["barcodes"],
    });
    if (!existing) return null;

    this.productRepo.merge(existing, {
      detalle: input.detalle,
      costo_neto: input.costo_neto,
      costo_final: input.costo_final,
      iva: input.iva,
      cambio_costo: input.cambio_costo,
      cambio_precio: input.cambio_precio,
      etiqueta: input.etiqueta,
      facturable: input.facturable,
      maneja_stock: input.maneja_stock,
    });

    if (input.codigos !== undefined) {
      await this.barcodeRepo.delete({ product_id: id });
      existing.barcodes = input.codigos.map((codigo) =>
        this.barcodeRepo.create({ codigo, product_id: id }),
      );
    }

    const saved = await this.productRepo.save(existing);
    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.productRepo.delete(id);
  }

  async existsAnyBarcode(
    codigos: string[],
    excludeProductId?: string,
  ): Promise<boolean> {
    const qb = this.barcodeRepo
      .createQueryBuilder("b")
      .where("b.codigo IN (:...codigos)", { codigos });
    if (excludeProductId) {
      qb.andWhere("b.product_id != :excludeProductId", { excludeProductId });
    }
    const count = await qb.getCount();
    return count > 0;
  }

  private toDomain(entity: ProductEntity): Product {
    const product = new Product();
    product.id = entity.id;
    product.detalle = entity.detalle;
    product.costo_neto = entity.costo_neto;
    product.costo_final = entity.costo_final;
    product.iva = entity.iva;
    product.cambio_costo = entity.cambio_costo;
    product.cambio_precio = entity.cambio_precio;
    product.etiqueta = entity.etiqueta;
    product.facturable = entity.facturable;
    product.maneja_stock = entity.maneja_stock;
    product.codigos = (entity.barcodes ?? []).map((b) => b.codigo);
    product.created_at = entity.created_at;
    product.updated_at = entity.updated_at;
    return product;
  }

  private createListQuery(search?: string): SelectQueryBuilder<ProductEntity> {
    const qb = this.productRepo
      .createQueryBuilder("product")
      .select(productProjection.list.map((field) => `product.${field}`))
      .leftJoin("product.barcodes", "barcode")
      .addSelect(["barcode.id", "barcode.product_id", "barcode.codigo"])
      .distinct(true);

    const normalizedSearch = search?.trim().toLowerCase();
    if (normalizedSearch) {
      qb.andWhere(
        "(LOWER(product.detalle) LIKE :search OR LOWER(barcode.codigo) LIKE :search)",
        { search: `%${normalizedSearch}%` },
      );
    }

    return qb;
  }
}
