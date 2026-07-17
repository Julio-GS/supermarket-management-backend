import { QueryRunner } from "typeorm";

export abstract class TransactionRunnerPort {
  abstract run<T>(work: (runner: QueryRunner) => Promise<T>): Promise<T>;
}
