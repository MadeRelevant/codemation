import type { TestSuiteRunId } from "../contracts/testTriggerTypes";

/**
 * Mints unique TestSuiteRun identifiers. Separated from {@link import("../types").RunIdFactory}
 * so suite ids and per-case workflow run ids never alias.
 */
export class TestSuiteRunIdFactory {
  makeTestSuiteRunId(): TestSuiteRunId {
    return `tsr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
