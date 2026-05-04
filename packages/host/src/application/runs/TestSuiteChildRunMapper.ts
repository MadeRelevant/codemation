import { injectable, type TestCaseRunStatus } from "@codemation/core";

import type { TestSuiteChildRunSummary } from "../../domain/runs/TestSuiteRunRepository";
import type { TestSuiteChildRunDto } from "../contracts/TestingContracts";

const TEST_CASE_RUN_STATUSES: ReadonlySet<TestCaseRunStatus> = new Set([
  "running",
  "succeeded",
  "failed",
  "errored",
  "cancelled",
]);

@injectable()
export class TestSuiteChildRunMapper {
  toDto(record: TestSuiteChildRunSummary): TestSuiteChildRunDto {
    // The repository carries `testCaseStatus` as a free `string?` to keep the persistence
    // type permissive; narrow to the public union here so the DTO never carries an unknown
    // value (defensive — the engine only ever writes the known statuses).
    const testCaseStatus =
      record.testCaseStatus !== undefined && TEST_CASE_RUN_STATUSES.has(record.testCaseStatus as TestCaseRunStatus)
        ? (record.testCaseStatus as TestCaseRunStatus)
        : undefined;
    return {
      runId: record.runId,
      testSuiteRunId: record.testSuiteRunId,
      testCaseIndex: record.testCaseIndex,
      ...(record.testCaseLabel !== undefined ? { testCaseLabel: record.testCaseLabel } : {}),
      status: record.status,
      ...(testCaseStatus !== undefined ? { testCaseStatus } : {}),
      startedAt: record.startedAt,
      ...(record.finishedAt !== undefined ? { finishedAt: record.finishedAt } : {}),
    };
  }
}
