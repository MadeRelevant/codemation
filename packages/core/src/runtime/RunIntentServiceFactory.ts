import type { WorkflowRepository } from "../types";

import { Engine } from "../orchestration/Engine";

import { RunIntentService } from "./RunIntentService";

export class RunIntentServiceFactory {
  create(engine: Engine, workflowRepository: WorkflowRepository): RunIntentService {
    return new RunIntentService(engine, workflowRepository);
  }
}
