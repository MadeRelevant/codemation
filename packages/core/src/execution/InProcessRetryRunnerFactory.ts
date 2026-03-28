import { DefaultAsyncSleeper } from "./DefaultAsyncSleeper";
import { InProcessRetryRunner } from "./InProcessRetryRunner";

export class InProcessRetryRunnerFactory {
  create(defaultAsyncSleeper: DefaultAsyncSleeper): InProcessRetryRunner {
    return new InProcessRetryRunner(defaultAsyncSleeper);
  }
}
