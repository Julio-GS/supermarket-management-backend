import { Test, TestingModule } from "@nestjs/testing";
import { RevalidateUseCase } from "../revalidate.use-case";
import { UserRepositoryPort } from "../../../users/application/user.repository.port";
import { User } from "../../../users/domain/user.entity";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "user-1",
    username: "cashier1",
    created_at: new Date("2026-06-01"),
    updated_at: new Date("2026-07-01"),
    ...overrides,
  }) as User;

const mockUserRepo = { findById: jest.fn() };

describe("RevalidateUseCase", () => {
  let useCase: RevalidateUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevalidateUseCase,
        { provide: UserRepositoryPort, useValue: mockUserRepo },
      ],
    }).compile();

    useCase = module.get<RevalidateUseCase>(RevalidateUseCase);
  });

  // -----------------------------------------------------------------------
  // RED — successful revalidation
  // -----------------------------------------------------------------------

  describe("successful revalidation", () => {
    it("returns valid=true when the user exists and is active", async () => {
      mockUserRepo.findById.mockResolvedValue(makeUser());

      const result = await useCase.execute("user-1");

      expect(result.valid).toBe(true);
      expect(result.user_id).toBe("user-1");
      expect(result.username).toBe("cashier1");
    });
  });

  // -----------------------------------------------------------------------
  // RED — user not found
  // -----------------------------------------------------------------------

  describe("user not found", () => {
    it("returns valid=false when the user does not exist", async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      const result = await useCase.execute("missing-user");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("not found");
    });
  });

  // -----------------------------------------------------------------------
  // RED — user disabled (if applicable)
  // -----------------------------------------------------------------------

  describe("rejected revalidation", () => {
    it("returns valid=false when the user repository throws (e.g., account disabled)", async () => {
      mockUserRepo.findById.mockRejectedValue(new Error("Account disabled"));

      const result = await useCase.execute("user-1");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Account disabled");
    });
  });

  // -----------------------------------------------------------------------
  // TRIANGULATE — different user
  // -----------------------------------------------------------------------

  describe("different users", () => {
    it("returns the correct username for a different user", async () => {
      mockUserRepo.findById.mockResolvedValue(makeUser({ id: "user-2", username: "manager1" }));

      const result = await useCase.execute("user-2");

      expect(result.valid).toBe(true);
      expect(result.username).toBe("manager1");
    });
  });
});
