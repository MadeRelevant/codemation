import type { Items } from "@codemation/core";
import { RetryPolicy } from "@codemation/core";
import { workflow } from "@codemation/host";
import { Callback } from "@codemation/core-nodes";

type SeedJson = Readonly<{ label: string }>;

/**
 * In-process retries: fails twice with a transient error, then succeeds on the third attempt.
 * Canvas / properties should show the retry policy badge and summary.
 */
class FlakyRetryCallback extends Callback<SeedJson, SeedJson> {
  readonly retryPolicy = new RetryPolicy(3, 25);
  private attempts = 0;

  constructor() {
    super("Flaky step (succeeds on 3rd attempt)", async (items: Items<SeedJson>) => {
      this.attempts += 1;
      if (this.attempts < 3) {
        throw new Error(`Simulated transient failure (attempt ${this.attempts})`);
      }
      return items.map((item) => {
        const base = typeof item.json === "object" && item.json !== null ? item.json : { label: "unknown" };
        return {
          ...item,
          json: {
            ...base,
            retryAttemptsUsed: this.attempts,
          },
        };
      });
    });
  }
}

export default workflow("wf.samples.policy.demo.retry")
  .name("Demo: in-process retry")
  .manualTrigger<SeedJson>("Manual trigger", [{ label: "retry-demo" }])
  .then(new FlakyRetryCallback())
  .build();
