import { Injectable } from "@nestjs/common";
import { UserRepositoryPort } from "../../users/application/user.repository.port";

export interface RevalidateResult {
  valid: boolean;
  user_id: string;
  username?: string;
  reason?: string;
}

/**
 * Validate that a previously authenticated user can still operate
 * (and sync privileged actions) on reconnect.
 */
@Injectable()
export class RevalidateUseCase {
  constructor(private readonly userRepo: UserRepositoryPort) {}

  async execute(userId: string): Promise<RevalidateResult> {
    try {
      const user = await this.userRepo.findById(userId);

      if (!user) {
        return {
          valid: false,
          user_id: userId,
          reason: `User '${userId}' not found.`,
        };
      }

      return {
        valid: true,
        user_id: user.id,
        username: user.username,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        user_id: userId,
        reason,
      };
    }
  }
}
