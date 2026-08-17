import { EntityManager } from "typeorm";
import { TypeOrmReportRepository } from "./typeorm-report.repository";

function createQueryBuilderMock() {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  return qb;
}

describe("TypeOrmReportRepository", () => {
  let em: jest.Mocked<EntityManager>;
  let repository: TypeOrmReportRepository;
  let qb: ReturnType<typeof createQueryBuilderMock>;

  const startsAt = new Date("2026-07-02T03:00:00.000Z");
  const endsAt = new Date("2026-07-03T02:59:59.999Z");

  beforeEach(() => {
    qb = createQueryBuilderMock();
    em = {
      createQueryBuilder: jest.fn(() => qb),
    } as unknown as jest.Mocked<EntityManager>;
    repository = new TypeOrmReportRepository(em);
  });

  it("queries total collected amount from sales table", async () => {
    qb.getRawOne.mockResolvedValueOnce({ amount: "1500.50" });
    qb.getRawMany.mockResolvedValue([]);

    const result = await repository.getBusinessReport(startsAt, endsAt);

    expect(result.totalCollectedAmount).toBe("1500.50");
    expect(em.createQueryBuilder).toHaveBeenCalled();
  });

  it("returns '0.00' when no sales match total query", async () => {
    qb.getRawOne.mockResolvedValueOnce(null);
    qb.getRawMany.mockResolvedValue([]);

    const result = await repository.getBusinessReport(startsAt, endsAt);

    expect(result.totalCollectedAmount).toBe("0.00");
  });

  it("returns payment method breakdown from sale_payment_methods", async () => {
    qb.getRawOne.mockResolvedValueOnce({ amount: "1500.00" });
    qb.getRawMany
      .mockResolvedValueOnce([
        { method: "cash", amount: "800.00" },
        { method: "card", amount: "700.00" },
      ])
      .mockResolvedValueOnce([]);

    const result = await repository.getBusinessReport(startsAt, endsAt);

    expect(result.paymentMethodBreakdown).toHaveLength(2);
    expect(result.paymentMethodBreakdown[0].method).toBe("cash");
    expect(result.paymentMethodBreakdown[0].amount).toBe("800.00");
  });

  it("returns top products joined with products table", async () => {
    qb.getRawOne.mockResolvedValueOnce({ amount: "1000.00" });
    qb.getRawMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { productId: "p1", detalle: "Milk", units_sold: 50 },
        { productId: "p2", detalle: "Bread", units_sold: 30 },
      ]);

    const result = await repository.getBusinessReport(startsAt, endsAt);

    expect(result.topProducts).toHaveLength(2);
    expect(result.topProducts[0].productId).toBe("p1");
    expect(result.topProducts[0].detalle).toBe("Milk");
    expect(result.topProducts[0].units_sold).toBe(50);
  });

  it("filters all queries by the provided date range", async () => {
    qb.getRawOne.mockResolvedValueOnce({ amount: "0.00" });
    qb.getRawMany.mockResolvedValue([]);

    await repository.getBusinessReport(startsAt, endsAt);

    // Verifies that where clauses were applied — the mock captures calls across all queries
    expect(qb.where).toHaveBeenCalledWith(
      "sales.created_at >= :startsAt",
      expect.objectContaining({ startsAt }),
    );
  });

  it("returns fiscal grouping with three buckets from aggregate row", async () => {
    qb.getRawOne
      .mockResolvedValueOnce({ amount: "1000.00" })
      .mockResolvedValueOnce({
        issued_amount: "100.00",
        issued_count: 2,
        none_amount: "50.00",
        none_count: 1,
        incident_amount: "50.00",
        incident_count: 2,
      });
    qb.getRawMany.mockResolvedValue([]);

    const result = await repository.getBusinessReport(startsAt, endsAt);

    expect(result.fiscal).toEqual({
      issued: { amount: "100.00", sale_count: 2 },
      none: { amount: "50.00", sale_count: 1 },
      incident: { amount: "50.00", sale_count: 2 },
    });
  });

  it("returns empty fiscal buckets when fiscal row is absent", async () => {
    qb.getRawOne
      .mockResolvedValueOnce({ amount: "1000.00" })
      .mockResolvedValueOnce(null);
    qb.getRawMany.mockResolvedValue([]);

    const result = await repository.getBusinessReport(startsAt, endsAt);

    expect(result.fiscal).toEqual({
      issued: { amount: "0.00", sale_count: 0 },
      none: { amount: "0.00", sale_count: 0 },
      incident: { amount: "0.00", sale_count: 0 },
    });
  });

  it("normalizes fiscal amounts to two-decimal strings", async () => {
    qb.getRawOne
      .mockResolvedValueOnce({ amount: "1000.00" })
      .mockResolvedValueOnce({
        issued_amount: "60.6",
        issued_count: "1",
        none_amount: 0,
        none_count: "0",
        incident_amount: "10.1",
        incident_count: 3,
      });
    qb.getRawMany.mockResolvedValue([]);

    const result = await repository.getBusinessReport(startsAt, endsAt);

    expect(result.fiscal.issued.amount).toBe("60.60");
    expect(result.fiscal.none.amount).toBe("0.00");
    expect(result.fiscal.incident.amount).toBe("10.10");
    expect(result.fiscal.incident.sale_count).toBe(3);
  });

  it("queries fiscal grouping with status predicates and date bounds", async () => {
    qb.getRawOne
      .mockResolvedValueOnce({ amount: "1000.00" })
      .mockResolvedValueOnce(null);
    qb.getRawMany.mockResolvedValue([]);

    await repository.getBusinessReport(startsAt, endsAt);

    const selectExprs = [
      qb.select.mock.calls.map((c) => String(c[0])).join(" "),
      qb.addSelect.mock.calls.map((c) => String(c[0])).join(" "),
    ].join(" ");

    expect(selectExprs).toContain("invoice_status = 'issued'");
    expect(selectExprs).toContain("invoice_status = 'none'");
    expect(selectExprs).toContain("invoice_status IN ('issuing', 'failed', 'ambiguous')");
    expect(selectExprs).toContain("sales.total");
    expect(qb.where).toHaveBeenCalledWith(
      "sales.created_at >= :startsAt",
      expect.objectContaining({ startsAt }),
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      "sales.created_at <= :endsAt",
      expect.objectContaining({ endsAt }),
    );
  });

});
