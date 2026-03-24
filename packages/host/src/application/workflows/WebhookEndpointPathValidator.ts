import type { WorkflowDefinition } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import type { LoggerFactory } from "../logging/Logger";
import { ApplicationTokens } from "../../applicationTokens";

@injectable()
export class WebhookEndpointPathValidator {
  constructor(@inject(ApplicationTokens.LoggerFactory) private readonly loggerFactory: LoggerFactory) {}

  validateAndWarn(workflows: ReadonlyArray<WorkflowDefinition>): void {
    const logger = this.loggerFactory.create("codemation.webhooks.path");
    for (const wf of workflows) {
      for (const node of wf.nodes) {
        if (node.kind !== "trigger") {
          continue;
        }
        const cfg = node.config as { endpointKey?: unknown };
        if (typeof cfg.endpointKey !== "string") {
          continue;
        }
        const path = cfg.endpointKey;
        if (path.includes(".")) {
          logger.warn(
            `Webhook endpoint path "${path}" in workflow "${wf.id}" contains a dot; use a stable URL segment without dots for predictable routing.`,
          );
        }
        if (path.includes("/")) {
          logger.warn(
            `Webhook endpoint path "${path}" in workflow "${wf.id}" contains "/"; use a single URL segment (no slashes).`,
          );
        }
      }
    }
  }
}
