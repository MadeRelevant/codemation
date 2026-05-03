import { inject, injectable, type JsonValue } from "@codemation/core";

import type {
  RecordTestAssertionArgs,
  TestAssertionMeanScoreAggregation,
  TestAssertionRecord,
  TestAssertionRepository,
} from "../../domain/runs/TestAssertionRepository";

import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

interface PrismaTestAssertionRow {
  id: string;
  runId: string;
  testSuiteRunId: string;
  workflowId: string;
  nodeId: string;
  iterationId: string | null;
  itemIndex: number | null;
  name: string;
  score: number;
  passThreshold: number | null;
  errored: boolean;
  expectedJson: string | null;
  actualJson: string | null;
  message: string | null;
  detailsJson: string | null;
  createdAt: string;
}

@injectable()
export class PrismaTestAssertionRepository implements TestAssertionRepository {
  constructor(@inject(PrismaDatabaseClientToken) private readonly prisma: PrismaDatabaseClient) {}

  async record(args: RecordTestAssertionArgs): Promise<void> {
    await this.prisma.testAssertion.create({
      data: {
        id: args.id,
        runId: args.runId,
        testSuiteRunId: args.testSuiteRunId,
        workflowId: args.workflowId,
        nodeId: args.nodeId,
        iterationId: args.iterationId ?? null,
        itemIndex: args.itemIndex ?? null,
        name: args.name,
        score: args.score,
        passThreshold: args.passThreshold ?? null,
        errored: args.errored === true,
        expectedJson: args.expected !== undefined ? JSON.stringify(args.expected) : null,
        actualJson: args.actual !== undefined ? JSON.stringify(args.actual) : null,
        message: args.message ?? null,
        detailsJson: args.details !== undefined ? JSON.stringify(args.details) : null,
        createdAt: args.createdAt,
      },
    });
  }

  async listByRun(runId: string): Promise<ReadonlyArray<TestAssertionRecord>> {
    const rows = (await this.prisma.testAssertion.findMany({
      where: { runId },
      orderBy: { createdAt: "asc" },
    })) as ReadonlyArray<PrismaTestAssertionRow>;
    return rows.map((row) => this.toRecord(row));
  }

  async listByTestSuiteRun(testSuiteRunId: string): Promise<ReadonlyArray<TestAssertionRecord>> {
    const rows = (await this.prisma.testAssertion.findMany({
      where: { testSuiteRunId },
      orderBy: { createdAt: "asc" },
    })) as ReadonlyArray<PrismaTestAssertionRow>;
    return rows.map((row) => this.toRecord(row));
  }

  async deleteByTestSuiteRun(testSuiteRunId: string): Promise<void> {
    await this.prisma.testAssertion.deleteMany({ where: { testSuiteRunId } });
  }

  async listDistinctNamesByWorkflow(workflowId: string): Promise<ReadonlyArray<string>> {
    const rows = (await this.prisma.testAssertion.findMany({
      where: { workflowId },
      distinct: ["name"],
      select: { name: true },
      orderBy: { name: "asc" },
    })) as ReadonlyArray<{ name: string }>;
    return rows.map((r) => r.name);
  }

  async aggregateMeanScoreByNameAndSuiteRun(args: {
    readonly workflowId: string;
    readonly names?: ReadonlyArray<string>;
  }): Promise<ReadonlyArray<TestAssertionMeanScoreAggregation>> {
    // Prisma's generated `name.in` is `string[]` (mutable), so copy out of the readonly input.
    const where: { workflowId: string; name?: { in: string[] } } = { workflowId: args.workflowId };
    if (args.names && args.names.length > 0) {
      where.name = { in: [...args.names] };
    }
    // Prisma's `groupBy` is heavily overloaded — its returned type is a discriminated tuple
    // shape that TypeScript can't infer through the readonly-array adjustments above. The
    // assertion-record schema is fixed (workflowId/name/score/etc. — see schema.*.prisma) so
    // we explicitly type the call arguments to bypass the overload intersection trip-up.
    const groups = (await (this.prisma.testAssertion.groupBy as unknown as (input: unknown) => Promise<unknown>)({
      by: ["testSuiteRunId", "name"],
      where,
      _avg: { score: true },
      _count: { _all: true },
    })) as ReadonlyArray<{
      testSuiteRunId: string;
      name: string;
      _avg: { score: number | null };
      _count: { _all: number };
    }>;
    return groups.map((row) => ({
      testSuiteRunId: row.testSuiteRunId,
      name: row.name,
      meanScore: row._avg.score ?? 0,
      sampleCount: row._count._all,
    }));
  }

  private toRecord(row: PrismaTestAssertionRow): TestAssertionRecord {
    return {
      id: row.id,
      runId: row.runId,
      testSuiteRunId: row.testSuiteRunId,
      workflowId: row.workflowId,
      nodeId: row.nodeId,
      iterationId: row.iterationId ?? undefined,
      itemIndex: row.itemIndex ?? undefined,
      name: row.name,
      score: row.score,
      passThreshold: row.passThreshold ?? undefined,
      ...(row.errored ? { errored: true as const } : {}),
      expected: row.expectedJson ? (JSON.parse(row.expectedJson) as JsonValue) : undefined,
      actual: row.actualJson ? (JSON.parse(row.actualJson) as JsonValue) : undefined,
      message: row.message ?? undefined,
      details: row.detailsJson ? (JSON.parse(row.detailsJson) as Readonly<Record<string, JsonValue>>) : undefined,
      createdAt: row.createdAt,
    };
  }
}
