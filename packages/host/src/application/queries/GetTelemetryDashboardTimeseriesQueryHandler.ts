import { inject } from "@codemation/core";
import type { TelemetryDashboardTimeseriesDto } from "../contracts/TelemetryDashboardContracts";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import { TelemetryQueryService } from "../telemetry/TelemetryQueryService";
import { GetTelemetryDashboardTimeseriesQuery } from "./GetTelemetryDashboardTimeseriesQuery";

@HandlesQuery.for(GetTelemetryDashboardTimeseriesQuery)
export class GetTelemetryDashboardTimeseriesQueryHandler extends QueryHandler<
  GetTelemetryDashboardTimeseriesQuery,
  TelemetryDashboardTimeseriesDto
> {
  constructor(@inject(TelemetryQueryService) private readonly telemetryQueryService: TelemetryQueryService) {
    super();
  }

  async execute(query: GetTelemetryDashboardTimeseriesQuery): Promise<TelemetryDashboardTimeseriesDto> {
    const [runSeries, aiSeries, costSeries] = await Promise.all([
      this.telemetryQueryService.summarizeRunsTimeseries(query.request.filters, query.request.interval),
      this.telemetryQueryService.summarizeAiUsageTimeseries(query.request.filters, query.request.interval),
      this.telemetryQueryService.summarizeCostsTimeseries(query.request.filters, query.request.interval),
    ]);
    return {
      interval: query.request.interval,
      buckets: runSeries.buckets.map((runBucket, index) => ({
        ...runBucket,
        inputTokens: aiSeries.buckets[index]?.inputTokens ?? 0,
        outputTokens: aiSeries.buckets[index]?.outputTokens ?? 0,
        totalTokens: aiSeries.buckets[index]?.totalTokens ?? 0,
        cachedInputTokens: aiSeries.buckets[index]?.cachedInputTokens ?? 0,
        reasoningTokens: aiSeries.buckets[index]?.reasoningTokens ?? 0,
        costs: costSeries.buckets[index]?.costs ?? [],
      })),
    };
  }
}
