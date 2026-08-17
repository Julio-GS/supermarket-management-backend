import { Test, TestingModule } from "@nestjs/testing";
import { ReportsController } from "./reports.controller";
import { GetBusinessReportUseCase } from "../application/get-business-report.use-case";
import { CreateProviderPurchaseUseCase } from "../application/create-provider-purchase.use-case";
import { ListProviderPurchasesUseCase } from "../application/list-provider-purchases.use-case";
import { UpdateProviderPurchaseUseCase } from "../application/update-provider-purchase.use-case";
import { DeleteProviderPurchaseUseCase } from "../application/delete-provider-purchase.use-case";
import { GetProviderPurchaseReportUseCase } from "../application/get-provider-purchase-report.use-case";
import { ValidationError } from "../../../shared/errors/domain.error";
import { BusinessReport } from "../domain/report.entity";

describe("ReportsController", () => {
  let controller: ReportsController;
  let getBusinessReport: jest.Mocked<GetBusinessReportUseCase>;

  function makeReport(
    overrides: Partial<BusinessReport> = {},
  ): BusinessReport {
    return {
      window: "custom",
      range: { startsAt: "2025-01-01T00:00:00.000Z", endsAt: "2025-01-31T23:59:59.000Z" },
      totalCollectedAmount: "1000.00",
      paymentMethodBreakdown: [
        { method: "cash", amount: "600.00" },
        { method: "card", amount: "400.00" },
      ],
      topProducts: [{ productId: "p1", detalle: "Milk", units_sold: 10 }],
      fiscal: {
        issued: { amount: "100.00", sale_count: 2 },
        none: { amount: "50.00", sale_count: 1 },
        incident: { amount: "50.00", sale_count: 2 },
      },
      ...overrides,
    };
  }

  function mockUseCase<T>(cls: new (...args: any[]) => T): jest.Mocked<T> {
    const proto = cls.prototype as Record<string, unknown>;
    const mock: Record<string, jest.Mock> = {};
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key !== "constructor" && typeof proto[key] === "function") {
        mock[key] = jest.fn();
      }
    }
    return mock as unknown as jest.Mocked<T>;
  }

  beforeEach(async () => {
    const mockBusinessReport = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetBusinessReportUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: GetBusinessReportUseCase, useValue: mockBusinessReport },
        { provide: CreateProviderPurchaseUseCase, useValue: mockUseCase(CreateProviderPurchaseUseCase) },
        { provide: ListProviderPurchasesUseCase, useValue: mockUseCase(ListProviderPurchasesUseCase) },
        { provide: UpdateProviderPurchaseUseCase, useValue: mockUseCase(UpdateProviderPurchaseUseCase) },
        { provide: DeleteProviderPurchaseUseCase, useValue: mockUseCase(DeleteProviderPurchaseUseCase) },
        { provide: GetProviderPurchaseReportUseCase, useValue: mockUseCase(GetProviderPurchaseReportUseCase) },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    getBusinessReport = module.get(GetBusinessReportUseCase);
  });

  it("passes parsed window input to use case", async () => {
    const parsed = { mode: "window" as const, window: "day" as const };
    jest
      .spyOn(GetBusinessReportUseCase, "parseBusinessReportInput")
      .mockReturnValue(parsed);
    getBusinessReport.execute.mockResolvedValue(makeReport({ window: "day" }));

    const result = await controller.getReport({ window: "day" } as any);

    expect(GetBusinessReportUseCase.parseBusinessReportInput).toHaveBeenCalledWith(
      { window: "day" },
    );
    expect(getBusinessReport.execute).toHaveBeenCalledWith(parsed);
    expect(result.window).toBe("day");
  });

  it("passes parsed custom input to use case", async () => {
    const parsed = {
      mode: "custom" as const,
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
    };
    jest
      .spyOn(GetBusinessReportUseCase, "parseBusinessReportInput")
      .mockReturnValue(parsed);
    getBusinessReport.execute.mockResolvedValue(makeReport());

    const result = await controller.getReport({
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
    } as any);

    expect(GetBusinessReportUseCase.parseBusinessReportInput).toHaveBeenCalledWith({
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
    });
    expect(getBusinessReport.execute).toHaveBeenCalledWith(parsed);
    expect(result.window).toBe("custom");
  });

  it("maps BusinessReport to ReportResponseDto correctly", async () => {
    const parsed = { mode: "custom" as const, from: "2025-01-01T00:00:00Z", to: "2025-01-31T23:59:59Z" };
    jest
      .spyOn(GetBusinessReportUseCase, "parseBusinessReportInput")
      .mockReturnValue(parsed);
    getBusinessReport.execute.mockResolvedValue(makeReport());

    const result = await controller.getReport({
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
    } as any);

    expect(result).toEqual({
      window: "custom",
      range: { startsAt: "2025-01-01T00:00:00.000Z", endsAt: "2025-01-31T23:59:59.000Z" },
      totalCollectedAmount: "1000.00",
      paymentMethodBreakdown: [
        { method: "cash", amount: "600.00" },
        { method: "card", amount: "400.00" },
      ],
      topProducts: [{ productId: "p1", detalle: "Milk", units_sold: 10 }],
      fiscal: {
        issued: { amount: "100.00", sale_count: 2 },
        none: { amount: "50.00", sale_count: 1 },
        incident: { amount: "50.00", sale_count: 2 },
      },
    });
  });

  it("maps fiscal grouping with empty buckets to zero amounts", async () => {
    jest
      .spyOn(GetBusinessReportUseCase, "parseBusinessReportInput")
      .mockReturnValue({
        mode: "custom",
        from: "2025-01-01T00:00:00Z",
        to: "2025-01-31T23:59:59Z",
      });
    getBusinessReport.execute.mockResolvedValue(
      makeReport({
        fiscal: {
          issued: { amount: "0.00", sale_count: 0 },
          none: { amount: "0.00", sale_count: 0 },
          incident: { amount: "0.00", sale_count: 0 },
        },
      }),
    );

    const result = await controller.getReport({
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
    } as any);

    expect(result.fiscal).toEqual({
      issued: { amount: "0.00", sale_count: 0 },
      none: { amount: "0.00", sale_count: 0 },
      incident: { amount: "0.00", sale_count: 0 },
    });
  });

  it("propagates ValidationError from parseBusinessReportInput", async () => {
    jest
      .spyOn(GetBusinessReportUseCase, "parseBusinessReportInput")
      .mockImplementation(() => {
        throw new ValidationError("Bad query");
      });

    await expect(
      controller.getReport({ window: "day", from: "x" } as any),
    ).rejects.toThrow(ValidationError);
  });
});
