import { ListSalesUseCase } from "./list-sales.use-case";
import { SaleRepositoryPort } from "./sale.repository.port";
import { createPage } from "../../../shared/read-model/page";

describe("ListSalesUseCase", () => {
  let sales: jest.Mocked<SaleRepositoryPort>;
  let useCase: ListSalesUseCase;

  beforeEach(() => {
    sales = {
      create: jest.fn(),
      findByUser: jest.fn(),
      findPageByUser: jest.fn(),
      findByIdForUser: jest.fn(),
    };
    useCase = new ListSalesUseCase(sales);
  });

  it("keeps default sale list reads compatible", async () => {
    sales.findByUser.mockResolvedValue([]);

    await expect(useCase.execute("user-id")).resolves.toEqual([]);
    expect(sales.findByUser).toHaveBeenCalledWith("user-id");
  });

  it("delegates paginated sale reads to the repository page contract", async () => {
    const options = { page: 1, limit: 10, sort: "created_at:desc" };
    sales.findPageByUser.mockResolvedValue(createPage([], 0, options));

    await expect(useCase.executePage("user-id", options)).resolves.toEqual(
      createPage([], 0, options),
    );
    expect(sales.findPageByUser).toHaveBeenCalledWith("user-id", options);
  });
});
