import * as fs from "fs";
import * as path from "path";

describe("report.entity.ts import contract", () => {
  const filePath = path.join(__dirname, "report.entity.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  it("should use import type for PaymentMethod from sale.entity", () => {
    expect(source).toMatch(
      /import\s+type\s+\{\s*PaymentMethod\s*\}\s+from\s+["']\.\.\/\.\.\/sales\/domain\/sale\.entity["']/,
    );
  });

  it("should NOT import PAYMENT_METHODS (runtime constant)", () => {
    expect(source).not.toMatch(/PAYMENT_METHODS/);
  });
  it("should NOT have any other runtime imports from sale.entity", () => {
    const runtimeImportPattern = /^import\s+\{[^}]*\}\s+from\s+["']\.\.\/\.\.\/sales\/domain\/sale\.entity["']/m;
    expect(source).not.toMatch(runtimeImportPattern);
  });
});

describe("typeorm-report.repository.ts import contract", () => {
  const filePath = path.join(
    __dirname,
    "..",
    "infrastructure",
    "typeorm-report.repository.ts",
  );
  const source = fs.readFileSync(filePath, "utf-8");

  it("should use import type for PaymentMethod from sale.entity", () => {
    expect(source).toMatch(
      /import\s+type\s+\{\s*PaymentMethod\s*\}\s+from\s+["']\.\.\/\.\.\/sales\/domain\/sale\.entity["']/,
    );
  });
});
