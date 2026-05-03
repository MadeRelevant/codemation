import { injectable } from "@codemation/core";

import type { TestSuiteChildRunSummary } from "../../domain/runs/TestSuiteRunRepository";
import type { TestSuiteChildRunDto } from "../contracts/TestingContracts";

@injectable()
export class TestSuiteChildRunMapper {
  toDto(record: TestSuiteChildRunSummary): TestSuiteChildRunDto {
    return {
      runId: record.runId,
      testSuiteRunId: record.testSuiteRunId,
      testCaseIndex: record.testCaseIndex,
      ...(record.testCaseLabel !== undefined ? { testCaseLabel: record.testCaseLabel } : {}),
      status: record.status,
      startedAt: record.startedAt,
      ...(record.finishedAt !== undefined ? { finishedAt: record.finishedAt } : {}),
    };
  }
}
