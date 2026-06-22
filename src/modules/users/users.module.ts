import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserRepositoryPort } from "./application/user.repository.port";
import { TypeOrmUserRepository } from "./infrastructure/typeorm-user.repository";
import { UserEntity } from "./infrastructure/typeorm-user.entity";

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [
    {
      provide: UserRepositoryPort,
      useClass: TypeOrmUserRepository,
    },
  ],
  exports: [UserRepositoryPort],
})
export class UsersModule {}
