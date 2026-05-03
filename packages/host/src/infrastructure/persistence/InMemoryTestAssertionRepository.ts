import { injectable } from "@codemation/core";

import type {
  RecordTestAssertionArgs,
  TestAssertionRecord,
  TestAssertionRepository,
} from "../../domain/runs/TestAssertionRepository";

@injectable()
export class InMemoryTestAssertionRepository implements TestAssertionRepository {
  private readonly recordsById = new Map<string, TestAssertionRecord>();

  async record(args: RecordTestAssertionArgs): Promise<void> {
    this.recordsById.set(args.id, { ...args });
  }

  async listByRun(runId: string): Promise<ReadonlyArray<TestAssertionRecord>> {
    return [...this.recordsById.values()]
      .filter((r) => r.runId === runId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async listByTestSuiteRun(testSuiteRunId: string): Promise<ReadonlyArray<TestAssertionRecord>> {
    return [...this.recordsById.values()]
      .filter((r) => r.testSuiteRunId === testSuiteRunId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async deleteByTestSuiteRun(testSuiteRunId: string): Promise<void> {
    for (const [id, record] of this.recordsById) {
      if (record.testSuiteRunId === testSuiteRunId) {
        this.recordsById.delete(id);
      }
    }
  }
}
