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
    // Normalize: only set `errored` when explicitly true so equality checks against the type
    // (which has `errored?: true`) match — a stored `errored: false` would be a contract violation.
    const record: TestAssertionRecord = {
      id: args.id,
      runId: args.runId,
      testSuiteRunId: args.testSuiteRunId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      ...(args.iterationId !== undefined ? { iterationId: args.iterationId } : {}),
      ...(args.itemIndex !== undefined ? { itemIndex: args.itemIndex } : {}),
      name: args.name,
      score: args.score,
      ...(args.passThreshold !== undefined ? { passThreshold: args.passThreshold } : {}),
      ...(args.errored === true ? { errored: true as const } : {}),
      ...(args.expected !== undefined ? { expected: args.expected } : {}),
      ...(args.actual !== undefined ? { actual: args.actual } : {}),
      ...(args.message !== undefined ? { message: args.message } : {}),
      ...(args.details !== undefined ? { details: args.details } : {}),
      createdAt: args.createdAt,
    };
    this.recordsById.set(args.id, record);
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
