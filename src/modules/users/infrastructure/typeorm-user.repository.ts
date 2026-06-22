import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  UserRepositoryPort,
  CreateUserInput,
} from "../application/user.repository.port";
import { User } from "../domain/user.entity";
import { UserEntity } from "./typeorm-user.entity";

@Injectable()
export class TypeOrmUserRepository extends UserRepositoryPort {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {
    super();
  }

  async create(input: CreateUserInput): Promise<User> {
    const entity = this.repo.create(input);
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async findByUsername(username: string): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { username } });
    return entity ? this.toDomain(entity) : null;
  }

  async findById(id: string): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  private toDomain(entity: UserEntity): User {
    const user = new User();
    user.id = entity.id;
    user.username = entity.username;
    user.password_hash = entity.password_hash;
    user.created_at = entity.created_at;
    user.updated_at = entity.updated_at;
    return user;
  }
}
