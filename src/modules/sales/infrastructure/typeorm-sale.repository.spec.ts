import * as crypto from "crypto";
import { Repository } from "typeorm";
import { TypeOrmSaleRepository } from "./typeorm-sale.repository";
import { SaleEntity } from "./typeorm-sale.entity";
import { SaleItemEntity } from "./typeorm-sale-item.entity";
import { SalePaymentMethodEntity } from "./typeorm-sale-payment-method.entity";
import { SaleTicketAllocationEntity } from "./typeorm-sale-ticket-allocation.entity";
import { saleProjection } from "../../../shared/read-model/projection";

jest.mock("crypto", () => ({
  randomUUID: jest.fn(),
}));

describe("TypeOrmSaleRepository", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const saleId = "00000000-0000-0000-0000-000000000001";
  const itemId1 = "00000000-0000-0000-0000-000000000002";

  it("applies the sale projection preset and split allocation join for user page reads", async () => {
    const qb = createQueryBuilderMock();
    const saleRepo = {
      createQueryBuilder: jest.fn(() => qb),
    } as unknown as Repository<SaleEntity>;

    const repository = new TypeOrmSaleRepository(
      saleRepo,
      {} as Repository<SaleItemEntity>,
      {} as Repository<SalePaymentMethodEntity>,
      {} as Repository<SaleTicketAllocationEntity>,
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
    expect(qb.leftJoin).toHaveBeenCalledWith(
      "sale.payment_methods",
      "payment_method",
    );
    expect(qb.leftJoin).toHaveBeenCalledWith(
      "sale.split_ticket_allocations",
      "split_ticket_allocation",
    );
    expect(qb.addSelect).toHaveBeenCalledWith([
      "item.id",
      "item.sale_id",
      "item.product_id",
      "item.quantity",
      "item.unit_price",
      "item.subtotal",
    ]);
    expect(qb.addSelect).toHaveBeenCalledWith([
      "payment_method.id",
      "payment_method.sale_id",
      "payment_method.method",
    ]);
    expect(qb.addSelect).toHaveBeenCalledWith([
      "split_ticket_allocation.id",
      "split_ticket_allocation.sale_id",
      "split_ticket_allocation.sale_item_id",
      "split_ticket_allocation.ticket_group_label",
      "split_ticket_allocation.quantity",
    ]);
    expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
    expect(qb.where).toHaveBeenCalledWith("sale.user_id = :user_id", {
      user_id: "user-id",
    });
    expect(qb.skip).toHaveBeenCalledWith(30);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it("persists payment methods and split ticket allocations when creating a sale", async () => {
    const randomUUID = crypto.randomUUID as jest.MockedFunction<typeof crypto.randomUUID>;
    randomUUID.mockReturnValueOnce(saleId).mockReturnValueOnce(itemId1);

    const itemRepo = {
      create: jest.fn((input) => input),
    } as unknown as Repository<SaleItemEntity>;
    const paymentMethodRepo = {
      create: jest.fn((input) => input),
    } as unknown as Repository<SalePaymentMethodEntity>;
    const ticketAllocationRepo = {
      create: jest.fn((input) => input),
    } as unknown as Repository<SaleTicketAllocationEntity>;
    const saleRepo = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(
        buildSaleEntity({
          id: saleId,
          items: [
            {
              id: itemId1,
              sale_id: saleId,
              product_id: "product-id",
              quantity: 3,
              unit_price: "121.00",
              subtotal: "363.00",
            } as SaleItemEntity,
          ],
          split_ticket_allocations: [
            {
              id: "alloc-1",
              sale_id: saleId,
              sale_item_id: itemId1,
              ticket_group_label: "A",
              quantity: 2,
            } as SaleTicketAllocationEntity,
            {
              id: "alloc-2",
              sale_id: saleId,
              sale_item_id: itemId1,
              ticket_group_label: "B",
              quantity: 1,
            } as SaleTicketAllocationEntity,
          ],
        }),
      ),
    } as unknown as Repository<SaleEntity>;

    const repository = new TypeOrmSaleRepository(
      saleRepo,
      itemRepo,
      paymentMethodRepo,
      ticketAllocationRepo,
    );

    const result = await repository.create({
      user_id: "user-id",
      items: [
        {
          product_id: "product-id",
          quantity: 3,
          unit_price: "121.00",
          subtotal: "363.00",
        },
      ],
      total: "363.00",
      invoice_status: "none",
      payment_methods: ["cash", "card"],
      split_ticket_groups: [
        { label: "A", items: [{ product_id: "product-id", quantity: 2 }] },
        { label: "B", items: [{ product_id: "product-id", quantity: 1 }] },
      ],
    });

    expect(ticketAllocationRepo.create).toHaveBeenCalledWith({
      sale_id: saleId,
      sale_item_id: itemId1,
      ticket_group_label: "A",
      quantity: 2,
    });
    expect(ticketAllocationRepo.create).toHaveBeenCalledWith({
      sale_id: saleId,
      sale_item_id: itemId1,
      ticket_group_label: "B",
      quantity: 1,
    });
    expect(saleRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: saleId,
        payment_methods: [
          { method: "cash" },
          { method: "card" },
        ],
        split_ticket_allocations: [
          {
            sale_id: saleId,
            sale_item_id: itemId1,
            ticket_group_label: "A",
            quantity: 2,
          },
          {
            sale_id: saleId,
            sale_item_id: itemId1,
            ticket_group_label: "B",
            quantity: 1,
          },
        ],
      }),
    );
    expect(result.payment_methods).toEqual(["cash", "card"]);
    expect(result.split_ticket_groups).toEqual([
      {
        label: "A",
        items: [
          {
            product_id: "product-id",
            quantity: 2,
            unit_price: "121.00",
            subtotal: "242.00",
          },
        ],
      },
      {
        label: "B",
        items: [
          {
            product_id: "product-id",
            quantity: 1,
            unit_price: "121.00",
            subtotal: "121.00",
          },
        ],
      },
    ]);
  });

  it("loads split ticket groups for detail reads", async () => {
    const saleRepo = {
      findOne: jest.fn().mockResolvedValue(
        buildSaleEntity({
          split_ticket_allocations: [
            {
              id: "alloc-1",
              sale_id: saleId,
              sale_item_id: "item-id",
              ticket_group_label: "A",
              quantity: 2,
            } as SaleTicketAllocationEntity,
            {
              id: "alloc-2",
              sale_id: saleId,
              sale_item_id: "item-id",
              ticket_group_label: "B",
              quantity: 1,
            } as SaleTicketAllocationEntity,
          ],
        }),
      ),
    } as unknown as Repository<SaleEntity>;

    const repository = new TypeOrmSaleRepository(
      saleRepo,
      {} as Repository<SaleItemEntity>,
      {} as Repository<SalePaymentMethodEntity>,
      {} as Repository<SaleTicketAllocationEntity>,
    );

    const result = await repository.findByIdForUser(saleId, "user-id");

    expect(saleRepo.findOne).toHaveBeenCalledWith({
      where: { id: saleId, user_id: "user-id" },
      relations: ["items", "payment_methods", "split_ticket_allocations"],
    });
    expect(result?.split_ticket_groups).toEqual([
      {
        label: "A",
        items: [
          {
            product_id: "product-id",
            quantity: 2,
            unit_price: "121.00",
            subtotal: "242.00",
          },
        ],
      },
      {
        label: "B",
        items: [
          {
            product_id: "product-id",
            quantity: 1,
            unit_price: "121.00",
            subtotal: "121.00",
          },
        ],
      },
    ]);
  });

  it("reads historical sales without split allocations as null", async () => {
    const saleRepo = {
      findOne: jest.fn().mockResolvedValue(
        buildSaleEntity({
          payment_methods: undefined,
          split_ticket_allocations: undefined,
        }),
      ),
    } as unknown as Repository<SaleEntity>;

    const repository = new TypeOrmSaleRepository(
      saleRepo,
      {} as Repository<SaleItemEntity>,
      {} as Repository<SalePaymentMethodEntity>,
      {} as Repository<SaleTicketAllocationEntity>,
    );

    const result = await repository.findByIdForUser("sale-id", "user-id");

    expect(result?.payment_methods).toEqual([]);
    expect(result?.split_ticket_groups).toBeNull();
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

function buildSaleEntity(
  overrides: Partial<SaleEntity> = {},
): SaleEntity {
  return {
    id: "sale-id",
    user_id: "user-id",
    total: "121.00",
    invoice_status: "none",
    cae: null,
    cae_vto: null,
    cbte_nro: null,
    cbte_tipo: null,
    pto_vta: null,
    invoice_requested_at: null,
    items: [
      {
        id: "item-id",
        sale_id: "sale-id",
        product_id: "product-id",
        quantity: 1,
        unit_price: "121.00",
        subtotal: "121.00",
      } as SaleItemEntity,
    ],
    payment_methods: [
      { id: "pm-1", sale_id: "sale-id", method: "cash" } as SalePaymentMethodEntity,
      { id: "pm-2", sale_id: "sale-id", method: "card" } as SalePaymentMethodEntity,
    ],
    split_ticket_allocations: [] as SaleTicketAllocationEntity[],
    created_at: new Date("2024-01-01T00:00:00.000Z"),
    updated_at: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  } as SaleEntity;
}
