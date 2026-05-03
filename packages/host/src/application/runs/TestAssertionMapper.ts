import { injectable } from "@codemation/core";

import type { TestAssertionRecord } from "../../domain/runs/TestAssertionRepository";
import type { TestAssertionDto } from "../contracts/TestingContracts";

@injectable()
export class TestAssertionMapper {
  toDto(record: TestAssertionRecord): TestAssertionDto {
    return {
      id: record.id,
      runId: record.runId,
      testSuiteRunId: record.testSuiteRunId,
      workflowId: record.workflowId,
      nodeId: record.nodeId,
      ...(record.iterationId !== undefined ? { iterationId: record.iterationId } : {}),
      ...(record.itemIndex !== undefined ? { itemIndex: record.itemIndex } : {}),
      name: record.name,
      status: record.status,
      ...(record.score !== undefined ? { score: record.score } : {}),
      ...(record.expected !== undefined ? { expected: record.expected } : {}),
      ...(record.actual !== undefined ? { actual: record.actual } : {}),
      ...(record.message !== undefined ? { message: record.message } : {}),
      ...(record.details !== undefined ? { details: record.details } : {}),
      createdAt: record.createdAt,
    };
  }
}
