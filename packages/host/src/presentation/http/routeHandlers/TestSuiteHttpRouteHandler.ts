import { inject, injectable } from "@codemation/core";

import type { TestAssertionRepository } from "../../../domain/runs/TestAssertionRepository";
import {
  TestAssertionRepositoryToken,
  TestSuiteRunRepositoryToken,
} from "../../../application/runs/TestSuiteRunTrackerFactory";
import type { TestSuiteRunRepository } from "../../../domain/runs/TestSuiteRunRepository";
import { TestRunnerService } from "../../../application/runs/TestRunnerService";
import { TestAssertionMapper } from "../../../application/runs/TestAssertionMapper";
import { TestSuiteChildRunMapper } from "../../../application/runs/TestSuiteChildRunMapper";
import { TestSuiteRunSummaryMapper } from "../../../application/runs/TestSuiteRunSummaryMapper";
import type {
  StartTestSuiteRunRequest,
  StartTestSuiteRunResponse,
} from "../../../application/contracts/TestingContracts";
import { HttpRequestJsonBodyReader } from "../HttpRequestJsonBodyReader";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@injectable()
export class TestSuiteHttpRouteHandler {
  constructor(
    @inject(TestRunnerService) private readonly testRunner: TestRunnerService,
    @inject(TestSuiteRunRepositoryToken) private readonly suiteRepo: TestSuiteRunRepository,
    @inject(TestAssertionRepositoryToken) private readonly assertionRepo: TestAssertionRepository,
    @inject(TestSuiteRunSummaryMapper) private readonly summaryMapper: TestSuiteRunSummaryMapper,
    @inject(TestAssertionMapper) private readonly assertionMapper: TestAssertionMapper,
    @inject(TestSuiteChildRunMapper) private readonly childRunMapper: TestSuiteChildRunMapper,
  ) {}

  async postStartTestSuiteRun(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<StartTestSuiteRunRequest>(request);
      if (typeof body.triggerNodeId !== "string" || body.triggerNodeId.trim().length === 0) {
        return Response.json({ error: "Request body must include string triggerNodeId" }, { status: 400 });
      }
      const concurrency =
        typeof body.concurrency === "number" && Number.isFinite(body.concurrency) ? body.concurrency : undefined;
      const result = await this.testRunner.startTestSuiteRun({
        workflowId: params.workflowId!,
        triggerNodeId: body.triggerNodeId,
        ...(concurrency !== undefined ? { concurrency } : {}),
      });
      const response: StartTestSuiteRunResponse = {
        testSuiteRunId: result.testSuiteRunId,
        status: result.status,
      };
      return Response.json(response, { status: 201 });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getTestSuiteRunChildRuns(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const records = await this.testRunner.listChildRuns(params.testSuiteRunId!);
      return Response.json(records.map((r) => this.childRunMapper.toDto(r)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getTestSuiteRuns(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const records = await this.suiteRepo.listByWorkflow({ workflowId: params.workflowId! });
      return Response.json(records.map((r) => this.summaryMapper.toSummary(r)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getTestSuiteRun(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const record = await this.suiteRepo.findById(params.testSuiteRunId!);
      if (!record) {
        return Response.json({ error: "Unknown testSuiteRunId" }, { status: 404 });
      }
      return Response.json(this.summaryMapper.toDetail(record));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getTestSuiteRunAssertions(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const record = await this.suiteRepo.findById(params.testSuiteRunId!);
      if (!record) {
        return Response.json({ error: "Unknown testSuiteRunId" }, { status: 404 });
      }
      const assertions = await this.assertionRepo.listByTestSuiteRun(params.testSuiteRunId!);
      return Response.json(assertions.map((a) => this.assertionMapper.toDto(a)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getRunAssertions(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const assertions = await this.assertionRepo.listByRun(params.runId!);
      return Response.json(assertions.map((a) => this.assertionMapper.toDto(a)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }
}
