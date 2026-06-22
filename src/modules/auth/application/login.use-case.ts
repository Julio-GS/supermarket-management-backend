import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UserRepositoryPort } from "../../users/application/user.repository.port";
import { UnauthorizedError } from "../../../shared/errors/domain.error";

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginOutput {
  access_token: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly jwt: JwtService,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.users.findByUsername(input.username);
    if (!user) {
      throw new UnauthorizedError();
    }

    const valid = await bcrypt.compare(input.password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedError();
    }

    const payload = { sub: user.id, username: user.username };
    return { access_token: this.jwt.sign(payload) };
  }
}
