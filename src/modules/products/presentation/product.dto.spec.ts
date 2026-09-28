import "reflect-metadata";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { CreateProductDto, UpdateProductDto } from "./product.dto";

describe("Product DTO validation", () => {
  describe("CreateProductDto", () => {
    function createValidDto(overrides: Partial<CreateProductDto> = {}): CreateProductDto {
      const plain = {
        detalle: "Test Product",
        costo_neto: "100.00",
        costo_final: "200.00",
        iva: "21.00",
        cambio_costo: "2024-01-01",
        cambio_precio: "2024-01-01",
        etiqueta: "test",
        facturable: true,
        maneja_stock: false,
        codigos: ["TEST001"],
        ...overrides,
      };
      return plainToInstance(CreateProductDto, plain);
    }

    it("accepts valid IVA rates (21.00, 21, 10.50, 10.5)", async () => {
      for (const iva of ["21.00", "21", "10.50", "10.5"]) {
        const dto = createValidDto({ iva });
        const errors = await validate(dto);
        expect(errors.filter((e) => e.property === "iva")).toHaveLength(0);
      }
    });

    it("accepts null or undefined iva at DTO level (handled by use case according to facturabilidad)", async () => {
      const dtoNull = createValidDto({ iva: null });
      const errorsNull = await validate(dtoNull);
      expect(errorsNull.filter((e) => e.property === "iva")).toHaveLength(0);

      const dtoUndefined = createValidDto({ iva: undefined });
      const errorsUndefined = await validate(dtoUndefined);
      expect(errorsUndefined.filter((e) => e.property === "iva")).toHaveLength(0);
    });

    it("rejects 0 and 0.00 IVA rates", async () => {
      for (const iva of ["0", "0.00", "0.0"]) {
        const dto = createValidDto({ iva });
        const errors = await validate(dto);
        const ivaErrors = errors.filter((e) => e.property === "iva");
        expect(ivaErrors).toHaveLength(1);
        expect(ivaErrors[0].constraints?.ivaRate).toContain(
          "iva must be an allowed IVA rate: 10.50 or 21.00",
        );
      }
    });

    it("rejects unsupported IVA rates (27.00, 5.00, 2.50, negative, invalid text)", async () => {
      for (const iva of ["27.00", "27", "5.00", "5", "2.50", "-21.00", "abc"]) {
        const dto = createValidDto({ iva });
        const errors = await validate(dto);
        const ivaErrors = errors.filter((e) => e.property === "iva");
        expect(ivaErrors).toHaveLength(1);
        expect(ivaErrors[0].constraints?.ivaRate).toContain(
          "iva must be an allowed IVA rate: 10.50 or 21.00",
        );
      }
    });
  });

  describe("UpdateProductDto", () => {
    function createUpdateDto(overrides: Partial<UpdateProductDto> = {}): UpdateProductDto {
      return plainToInstance(UpdateProductDto, overrides);
    }

    it("accepts valid IVA rates (21.00, 10.50)", async () => {
      for (const iva of ["21.00", "21", "10.50", "10.5"]) {
        const dto = createUpdateDto({ iva });
        const errors = await validate(dto);
        expect(errors.filter((e) => e.property === "iva")).toHaveLength(0);
      }
    });

    it("accepts undefined iva when not updating it", async () => {
      const dto = createUpdateDto({ detalle: "New Name" });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === "iva")).toHaveLength(0);
    });

    it("rejects 0, 0.00, and unsupported IVA rates", async () => {
      for (const iva of ["0", "0.00", "27.00", "5.00", "invalid"]) {
        const dto = createUpdateDto({ iva });
        const errors = await validate(dto);
        const ivaErrors = errors.filter((e) => e.property === "iva");
        expect(ivaErrors).toHaveLength(1);
        expect(ivaErrors[0].constraints?.ivaRate).toContain(
          "iva must be an allowed IVA rate: 10.50 or 21.00",
        );
      }
    });
  });
});
