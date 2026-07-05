import { ReportAggregateData } from "../domain/report.entity";

export abstract class ReportRepositoryPort {
  abstract getBusinessReport(
    startsAt: Date,
    endsAt: Date,
  ): Promise<ReportAggregateData>;
}
