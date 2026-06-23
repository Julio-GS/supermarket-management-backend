import "reflect-metadata";
import {
  normalizePagination,
  offsetFor,
  parseSort,
  hasPaginationQuery,
} from "./pagination.dto";
import { createPage, mapPage } from "./page";
import { productProjection, saleProjection } from "./projection";

describe("read model pagination", () => {
  it("normalizes missing query values", () => {
    expect(normalizePagination({})).toEqual({
      page: 1,
      limit: 20,
      sort: undefined,
      search: undefined,
    });
  });

  it("normalizes search without making it a pagination trigger", () => {
    expect(normalizePagination({}, { search: "  leche  " })).toEqual({
      page: 1,
      limit: 20,
      sort: undefined,
      search: "leche",
    });
    expect(hasPaginationQuery({ search: "leche" })).toBe(false);
  });

  it("calculates offset and metadata", () => {
    const options = normalizePagination({ page: 2, limit: 10 });
    expect(offsetFor(options)).toBe(10);
    expect(createPage(["a"], 21, options).meta).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      totalPages: 3,
      hasNext: true,
    });
  });

  it("maps page data without changing metadata", () => {
    const page = createPage([1, 2], 2, normalizePagination({ limit: 2 }));
    expect(mapPage(page, String)).toEqual({
      data: ["1", "2"],
      meta: page.meta,
    });
  });

  it("accepts only allowed sort fields", () => {
    expect(
      parseSort("created_at:asc", ["created_at"], {
        field: "id",
        direction: "DESC",
      }),
    ).toEqual({
      field: "created_at",
      direction: "ASC",
    });
    expect(
      parseSort("unsafe:asc", ["created_at"], {
        field: "id",
        direction: "DESC",
      }),
    ).toEqual({
      field: "id",
      direction: "DESC",
    });
  });

  it("detects explicit pagination queries", () => {
    expect(hasPaginationQuery({})).toBe(false);
    expect(hasPaginationQuery({ page: 1 })).toBe(true);
  });

  it("exposes product and sale projection presets", () => {
    expect(productProjection.list).toContain("detalle");
    expect(saleProjection.list).toContain("invoice_status");
  });
});
