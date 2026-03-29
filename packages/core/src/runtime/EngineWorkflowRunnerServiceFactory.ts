import type { WorkflowRepository } from "../types";

import { Engine } from "../orchestration/Engine";

import { EngineWorkflowRunnerService } from "./EngineWorkflowRunnerService";

export class EngineWorkflowRunnerServiceFactory {
  create(engine: Engine, workflowRepository: WorkflowRepository): EngineWorkflowRunnerService {
    return new EngineWorkflowRunnerService(engine, workflowRepository);
  }
}
