import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { UserRepositoryPort } from "../../users/application/user.repository.port";
import { ConflictError } from "../../../shared/errors/domain.error";

export interface RegisterInput {
  username: string;
  password: string;
}

export interface RegisterOutput {
  user_id: string;
}

@Injectable()
export class RegisterUseCase {
  constructor(private readonly users: UserRepositoryPort) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    const existing = await this.users.findByUsername(input.username);
    if (existing) {
      throw new ConflictError("Username already exists");
    }

    const password_hash = await bcrypt.hash(input.password, 10);
    const user = await this.users.create({
      username: input.username,
      password_hash,
    });

    return { user_id: user.id };
  }
}
