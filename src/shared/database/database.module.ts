import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TransactionRunnerPort } from "./transaction-runner.port";
import { TypeOrmTransactionRunner } from "./typeorm-transaction.runner";

@Module({
  imports: [TypeOrmModule.forFeature([])],
  providers: [
    {
      provide: TransactionRunnerPort,
      useClass: TypeOrmTransactionRunner,
    },
  ],
  exports: [TransactionRunnerPort],
})
export class DatabaseModule {}
