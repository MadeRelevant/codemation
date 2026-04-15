import type { DependencyContainer } from "../../di";
import type { WebhookTriggerMatcher } from "../../types";
import type { WebhookTriggerRoutingDiagnostics } from "../../contracts/webhookTypes";
import type { TriggerRuntimeDiagnostics } from "../../contracts/runtimeTypes";
import type { WorkflowPolicyRuntimeDefaults } from "../../contracts/workflowTypes";
import type { EngineExecutionLimitsPolicyConfig } from "../../policies/executionLimits/EngineExecutionLimitsPolicy";

/**
 * Creates the webhook route matcher used by {@link import("../api/Engine").Engine}.
 * Hosts may supply logging/diagnostics; tests often use the default factory without diagnostics.
 */
export interface WebhookTriggerMatcherProvider {
  createMatcher(container: DependencyContainer): WebhookTriggerMatcher;
}

/**
 * Supplies optional trigger-runtime logging (inactive workflow skips, activation sync).
 */
export interface TriggerRuntimeDiagnosticsProvider {
  create(container: DependencyContainer): TriggerRuntimeDiagnostics | undefined;
}

export interface EngineRuntimeRegistrationOptions {
  /**
   * Static limits merged into the factory when the policy token is first resolved.
   * Prefer {@link resolveEngineExecutionLimits} when limits can change after registration (e.g. host `useRuntimeConfig`).
   */
  engineExecutionLimits?: Partial<EngineExecutionLimitsPolicyConfig>;
  /**
   * Called when the limits policy is first resolved; overrides {@link engineExecutionLimits} when both are set.
   * Use this for host wiring so `runtime.engineExecutionLimits` applied after `registerCoreInfrastructure` is honored.
   */
  resolveEngineExecutionLimits?: () => Partial<EngineExecutionLimitsPolicyConfig> | undefined;
  /**
   * When {@link webhookTriggerMatcherProvider} is omitted, the registrar builds
   * {@link import("../../runtime/WorkflowRepositoryWebhookTriggerMatcher").WorkflowRepositoryWebhookTriggerMatcher}
   * using this optional routing diagnostics surface.
   */
  webhookTriggerRoutingDiagnostics?: WebhookTriggerRoutingDiagnostics;
  /** Overrides default webhook matcher construction (e.g. host-injected loggers). */
  webhookTriggerMatcherProvider?: WebhookTriggerMatcherProvider;
  /** Overrides default trigger diagnostics (undefined when omitted). */
  triggerRuntimeDiagnosticsProvider?: TriggerRuntimeDiagnosticsProvider;
  /** Runtime retention/storage defaults used when workflows omit prune/storage policy fields. */
  workflowPolicyRuntimeDefaults?: WorkflowPolicyRuntimeDefaults;
}
