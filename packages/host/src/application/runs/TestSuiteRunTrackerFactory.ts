import { inject, injectable, type TypeToken } from "@codemation/core";

import type { TestAssertionRepository } from "../../domain/runs/TestAssertionRepository";
import type { TestSuiteRunRepository } from "../../domain/runs/TestSuiteRunRepository";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";

import { AssertionResultGuard } from "./AssertionResultGuard";
import { TestAssertionIdFactory } from "./TestAssertionIdFactory";
import { TestSuiteRunTracker, type TestSuiteRunTrackerArgs } from "./TestSuiteRunTracker";

export const TestSuiteRunRepositoryToken = Symbol.for(
  "codemation.application.testing.TestSuiteRunRepository",
) as unknown as TypeToken<TestSuiteRunRepository>;

export const TestAssertionRepositoryToken = Symbol.for(
  "codemation.application.testing.TestAssertionRepository",
) as unknown as TypeToken<TestAssertionRepository>;

export const WorkflowRunRepositoryToken = Symbol.for(
  "codemation.application.runs.WorkflowRunRepository",
) as unknown as TypeToken<WorkflowRunRepository>;

/**
 * Builds a fresh per-suite {@link TestSuiteRunTracker}, wiring the repository + id-factory +
 * guard collaborators that are otherwise singletons. One Tracker per `startTestSuiteRun` call.
 */
@injectable()
export class TestSuiteRunTrackerFactory {
  constructor(
    @inject(TestSuiteRunRepositoryToken) private readonly suiteRepo: TestSuiteRunRepository,
    @inject(TestAssertionRepositoryToken) private readonly assertionRepo: TestAssertionRepository,
    @inject(WorkflowRunRepositoryToken) private readonly runRepo: WorkflowRunRepository,
    @inject(TestAssertionIdFactory) private readonly assertionIdFactory: TestAssertionIdFactory,
    @inject(AssertionResultGuard) private readonly assertionResultGuard: AssertionResultGuard,
  ) {}

  create(args: Pick<TestSuiteRunTrackerArgs, "workflow">): TestSuiteRunTracker {
    return new TestSuiteRunTracker({
      workflow: args.workflow,
      suiteRepo: this.suiteRepo,
      runRepo: this.runRepo,
      assertionRepo: this.assertionRepo,
      assertionIdFactory: this.assertionIdFactory,
      assertionResultGuard: this.assertionResultGuard,
    });
  }
}
