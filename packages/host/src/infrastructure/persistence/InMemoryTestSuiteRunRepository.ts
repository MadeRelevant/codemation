import { injectable } from "@codemation/core";

import type {
  CreateTestSuiteRunArgs,
  TestSuiteChildRunSummary,
  TestSuiteRunRecord,
  TestSuiteRunRepository,
  UpdateTestSuiteRunPatch,
} from "../../domain/runs/TestSuiteRunRepository";

@injectable()
export class InMemoryTestSuiteRunRepository implements TestSuiteRunRepository {
  private readonly recordsById = new Map<string, TestSuiteRunRecord>();

  async create(args: CreateTestSuiteRunArgs): Promise<void> {
    const now = new Date().toISOString();
    const record: TestSuiteRunRecord = {
      id: args.id,
      workflowId: args.workflowId,
      triggerNodeId: args.triggerNodeId,
      triggerNodeName: args.triggerNodeName,
      status: "running",
      concurrency: args.concurrency,
      startedAt: args.startedAt,
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      updatedAt: now,
    };
    this.recordsById.set(args.id, record);
  }

  async update(id: string, patch: UpdateTestSuiteRunPatch): Promise<void> {
    const existing = this.recordsById.get(id);
    if (!existing) {
      throw new Error(`Unknown TestSuiteRun id: ${id}`);
    }
    this.recordsById.set(id, {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  async findById(id: string): Promise<TestSuiteRunRecord | undefined> {
    return this.recordsById.get(id);
  }

  async listByWorkflow(
    args: Readonly<{ workflowId: string; limit?: number }>,
  ): Promise<ReadonlyArray<TestSuiteRunRecord>> {
    const filtered = [...this.recordsById.values()]
      .filter((r) => r.workflowId === args.workflowId)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return filtered.slice(0, args.limit ?? filtered.length);
  }

  async listChildRuns(_testSuiteRunId: string): Promise<ReadonlyArray<TestSuiteChildRunSummary>> {
    // The in-memory adapter is used by unit tests that drive the orchestrator with stub
    // engines — they don't go through a Run repository, so this list is empty by design.
    // Tests that need child-run visibility should use the Prisma adapter against a real DB.
    return [];
  }

  async deleteById(id: string): Promise<void> {
    this.recordsById.delete(id);
  }
}
