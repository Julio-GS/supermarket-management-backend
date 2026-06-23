import { Repository } from "typeorm";
import { TypeOrmSaleRepository } from "./typeorm-sale.repository";
import { SaleEntity } from "./typeorm-sale.entity";
import { SaleItemEntity } from "./typeorm-sale-item.entity";
import { saleProjection } from "../../../shared/read-model/projection";

describe("TypeOrmSaleRepository", () => {
  it("applies the sale projection preset and bounded pagination for user page reads", async () => {
    const qb = createQueryBuilderMock();
    const saleRepo = {
      createQueryBuilder: jest.fn(() => qb),
    } as unknown as Repository<SaleEntity>;

    const repository = new TypeOrmSaleRepository(
      saleRepo,
      {} as Repository<SaleItemEntity>,
    );

    await repository.findPageByUser("user-id", {
      page: 4,
      limit: 10,
      sort: "total:asc",
    });

    expect(qb.select).toHaveBeenCalledWith(
      saleProjection.list.map((field) => `sale.${field}`),
    );
    expect(qb.leftJoin).toHaveBeenCalledWith("sale.items", "item");
    expect(qb.addSelect).toHaveBeenCalledWith([
      "item.id",
      "item.sale_id",
      "item.product_id",
      "item.quantity",
      "item.unit_price",
      "item.subtotal",
    ]);
    expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
    expect(qb.where).toHaveBeenCalledWith("sale.user_id = :user_id", {
      user_id: "user-id",
    });
    expect(qb.skip).toHaveBeenCalledWith(30);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
  });
});

function createQueryBuilderMock() {
  const qb = {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getManyAndCount: jest.fn().mockResolvedValue([[], 1000]),
  };
  return qb;
}
