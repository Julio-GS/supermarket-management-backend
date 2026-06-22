import { User } from "../domain/user.entity";

export interface CreateUserInput {
  username: string;
  password_hash: string;
}

export abstract class UserRepositoryPort {
  abstract create(input: CreateUserInput): Promise<User>;
  abstract findByUsername(username: string): Promise<User | null>;
  abstract findById(id: string): Promise<User | null>;
}
