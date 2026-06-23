import { Repository } from "typeorm";
import { TypeOrmProductRepository } from "./typeorm-product.repository";
import { ProductEntity } from "./typeorm-product.entity";
import { ProductBarcodeEntity } from "./typeorm-product-barcode.entity";
import { productProjection } from "../../../shared/read-model/projection";

describe("TypeOrmProductRepository", () => {
  it("applies the product projection preset and bounded pagination for page reads", async () => {
    const qb = createQueryBuilderMock();
    const productRepo = {
      createQueryBuilder: jest.fn(() => qb),
    } as unknown as Repository<ProductEntity>;

    const repository = new TypeOrmProductRepository(
      productRepo,
      {} as Repository<ProductBarcodeEntity>,
    );

    await repository.findPage({ page: 3, limit: 25, sort: "detalle:asc" });

    expect(qb.select).toHaveBeenCalledWith(
      productProjection.list.map((field) => `product.${field}`),
    );
    expect(qb.leftJoin).toHaveBeenCalledWith("product.barcodes", "barcode");
    expect(qb.addSelect).toHaveBeenCalledWith([
      "barcode.id",
      "barcode.product_id",
      "barcode.codigo",
    ]);
    expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
    expect(qb.distinct).toHaveBeenCalledWith(true);
    expect(qb.skip).toHaveBeenCalledWith(50);
    expect(qb.take).toHaveBeenCalledWith(25);
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it("searches product list reads by detail or joined barcode with parameters", async () => {
    const qb = createQueryBuilderMock();
    const productRepo = {
      createQueryBuilder: jest.fn(() => qb),
    } as unknown as Repository<ProductEntity>;

    const repository = new TypeOrmProductRepository(
      productRepo,
      {} as Repository<ProductBarcodeEntity>,
    );

    await repository.findAll({ search: "  Leche  " });

    expect(qb.andWhere).toHaveBeenCalledWith(
      "(LOWER(product.detalle) LIKE :search OR LOWER(barcode.codigo) LIKE :search)",
      { search: "%leche%" },
    );
    expect(qb.getMany).toHaveBeenCalledTimes(1);
  });
});

function createQueryBuilderMock() {
  const qb = {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 1000]),
  };
  return qb;
}
