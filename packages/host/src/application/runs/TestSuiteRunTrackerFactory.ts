import { inject, injectable, type TypeToken } from "@codemation/core";

import { ApplicationTokens } from "../../applicationTokens";
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

/**
 * Builds a fresh per-suite {@link TestSuiteRunTracker}, wiring the repository + id-factory +
 * guard collaborators that are otherwise singletons. One Tracker per `startTestSuiteRun` call.
 */
@injectable()
export class TestSuiteRunTrackerFactory {
  constructor(
    @inject(TestSuiteRunRepositoryToken) private readonly suiteRepo: TestSuiteRunRepository,
    @inject(TestAssertionRepositoryToken) private readonly assertionRepo: TestAssertionRepository,
    // Reuse the existing ApplicationTokens.WorkflowRunRepository registration — both Prisma
    // and in-memory persistence branches in AppContainerFactory bind it consistently. A
    // separate `WorkflowRunRepositoryToken` (the one the haiku-generated B work introduced)
    // would have needed parallel registrations and broke the Prisma-backed dev runtime.
    @inject(ApplicationTokens.WorkflowRunRepository) private readonly runRepo: WorkflowRunRepository,
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
