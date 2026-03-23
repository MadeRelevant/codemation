import type { NoneRetryPolicySpec } from "./retryPolicySpec.types";

export class NoRetryPolicy implements NoneRetryPolicySpec {
  readonly kind = "none" as const;
}
