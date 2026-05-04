import { injectable } from "@codemation/core";

import type { TestSuiteRunRecord } from "../../domain/runs/TestSuiteRunRepository";
import type { TestSuiteRunDetailDto, TestSuiteRunSummaryDto } from "../contracts/TestingContracts";

/** Maps persistence records into HTTP DTOs. Trivial today; centralized so the wire shape stays stable. */
@injectable()
export class TestSuiteRunSummaryMapper {
  toSummary(record: TestSuiteRunRecord): TestSuiteRunSummaryDto {
    return {
      id: record.id,
      workflowId: record.workflowId,
      triggerNodeId: record.triggerNodeId,
      ...(record.triggerNodeName !== undefined ? { triggerNodeName: record.triggerNodeName } : {}),
      status: record.status,
      startedAt: record.startedAt,
      ...(record.finishedAt !== undefined ? { finishedAt: record.finishedAt } : {}),
      totalCases: record.totalCases,
      passedCases: record.passedCases,
      failedCases: record.failedCases,
    };
  }

  toDetail(record: TestSuiteRunRecord): TestSuiteRunDetailDto {
    return {
      ...this.toSummary(record),
      concurrency: record.concurrency,
      ...(record.nodeCoverage !== undefined ? { nodeCoverage: record.nodeCoverage } : {}),
      ...(record.errorMessage !== undefined ? { errorMessage: record.errorMessage } : {}),
      updatedAt: record.updatedAt,
    };
  }
}
