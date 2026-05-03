import { inject, injectable } from "@codemation/core";

import type { RunStatus } from "@codemation/core";

import type {
  CreateTestSuiteRunArgs,
  TestSuiteChildRunSummary,
  TestSuiteRunRecord,
  TestSuiteRunRepository,
  UpdateTestSuiteRunPatch,
} from "../../domain/runs/TestSuiteRunRepository";

import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

interface PrismaTestSuiteRunRow {
  id: string;
  workflowId: string;
  triggerNodeId: string;
  triggerNodeName: string | null;
  status: string;
  concurrency: number;
  startedAt: string;
  finishedAt: string | null;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  nodeCoverageJson: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

@injectable()
export class PrismaTestSuiteRunRepository implements TestSuiteRunRepository {
  constructor(@inject(PrismaDatabaseClientToken) private readonly prisma: PrismaDatabaseClient) {}

  async create(args: CreateTestSuiteRunArgs): Promise<void> {
    const now = new Date().toISOString();
    await this.prisma.testSuiteRun.create({
      data: {
        id: args.id,
        workflowId: args.workflowId,
        triggerNodeId: args.triggerNodeId,
        triggerNodeName: args.triggerNodeName ?? null,
        status: "running",
        concurrency: args.concurrency,
        startedAt: args.startedAt,
        finishedAt: null,
        totalCases: 0,
        passedCases: 0,
        failedCases: 0,
        nodeCoverageJson: null,
        errorMessage: null,
        updatedAt: now,
      },
    });
  }

  async update(id: string, patch: UpdateTestSuiteRunPatch): Promise<void> {
    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
    if (patch.totalCases !== undefined) data.totalCases = patch.totalCases;
    if (patch.passedCases !== undefined) data.passedCases = patch.passedCases;
    if (patch.failedCases !== undefined) data.failedCases = patch.failedCases;
    if (patch.nodeCoverage !== undefined) data.nodeCoverageJson = JSON.stringify([...patch.nodeCoverage]);
    if (patch.errorMessage !== undefined) data.errorMessage = patch.errorMessage;
    await this.prisma.testSuiteRun.update({ where: { id }, data });
  }

  async findById(id: string): Promise<TestSuiteRunRecord | undefined> {
    const row = (await this.prisma.testSuiteRun.findUnique({ where: { id } })) as PrismaTestSuiteRunRow | null;
    return row ? this.toRecord(row) : undefined;
  }

  async listByWorkflow(
    args: Readonly<{ workflowId: string; limit?: number }>,
  ): Promise<ReadonlyArray<TestSuiteRunRecord>> {
    const rows = (await this.prisma.testSuiteRun.findMany({
      where: { workflowId: args.workflowId },
      orderBy: { startedAt: "desc" },
      take: args.limit ?? 50,
    })) as ReadonlyArray<PrismaTestSuiteRunRow>;
    return rows.map((row) => this.toRecord(row));
  }

  async listChildRuns(testSuiteRunId: string): Promise<ReadonlyArray<TestSuiteChildRunSummary>> {
    const rows = (await this.prisma.run.findMany({
      where: { testSuiteRunId },
      orderBy: [{ testCaseIndex: "asc" }, { startedAt: "asc" }],
      select: {
        runId: true,
        testSuiteRunId: true,
        testCaseIndex: true,
        testCaseLabel: true,
        status: true,
        startedAt: true,
        finishedAt: true,
      },
    })) as ReadonlyArray<{
      runId: string;
      testSuiteRunId: string | null;
      testCaseIndex: number | null;
      testCaseLabel: string | null;
      status: string;
      startedAt: string;
      finishedAt: string | null;
    }>;
    return rows.map((row) => ({
      runId: row.runId,
      testSuiteRunId: row.testSuiteRunId ?? testSuiteRunId,
      testCaseIndex: row.testCaseIndex ?? 0,
      ...(row.testCaseLabel !== null ? { testCaseLabel: row.testCaseLabel } : {}),
      status: row.status as RunStatus,
      startedAt: row.startedAt,
      ...(row.finishedAt !== null ? { finishedAt: row.finishedAt } : {}),
    }));
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.testSuiteRun.delete({ where: { id } });
  }

  private toRecord(row: PrismaTestSuiteRunRow): TestSuiteRunRecord {
    return {
      id: row.id,
      workflowId: row.workflowId,
      triggerNodeId: row.triggerNodeId,
      triggerNodeName: row.triggerNodeName ?? undefined,
      status: row.status as TestSuiteRunRecord["status"],
      concurrency: row.concurrency,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt ?? undefined,
      totalCases: row.totalCases,
      passedCases: row.passedCases,
      failedCases: row.failedCases,
      nodeCoverage: row.nodeCoverageJson ? (JSON.parse(row.nodeCoverageJson) as ReadonlyArray<string>) : undefined,
      errorMessage: row.errorMessage ?? undefined,
      updatedAt: row.updatedAt,
    };
  }
}
