import type { WorkflowCredentialHealthDto } from "../../application/contracts/CredentialContractsRegistry";
import { getPersistedRuntimeTypeMetadata, injectable, type CredentialRequirement, type WorkflowDefinition } from "@codemation/core";
import { MissingRuntimeTriggerToken } from "@codemation/core/bootstrap";
import { ManualTriggerNode } from "@codemation/core-nodes";

@injectable()
export class WorkflowActivationPreflightRules {
  private readonly manualTriggerTypeName: string;
  private readonly missingRuntimeTriggerTypeName: string;

  constructor() {
    this.manualTriggerTypeName = this.resolveRuntimeTypeTokenName(ManualTriggerNode);
    this.missingRuntimeTriggerTypeName = this.resolveRuntimeTypeTokenName(MissingRuntimeTriggerToken);
  }

  /**
   * Compare node runtime tokens by persisted decorator name (and constructor name fallback).
   * Reference equality breaks when the host and consumer workflow each load a separate copy of
   * `@codemation/core-nodes` (duplicate class identity for the same logical trigger type).
   */
  private resolveRuntimeTypeTokenName(token: unknown): string {
    const meta = getPersistedRuntimeTypeMetadata(token);
    if (meta) {
      return meta.persistedName;
    }
    if (typeof token === "function") {
      return (token as { name?: string }).name ?? "";
    }
    return "";
  }

  private isManualTriggerType(token: unknown): boolean {
    return this.resolveRuntimeTypeTokenName(token) === this.manualTriggerTypeName;
  }

  private isMissingRuntimeTriggerType(token: unknown): boolean {
    return this.resolveRuntimeTypeTokenName(token) === this.missingRuntimeTriggerTypeName;
  }

  collectNonManualTriggerErrors(workflow: WorkflowDefinition): ReadonlyArray<string> {
    const triggerNodes = workflow.nodes.filter((n) => n.kind === "trigger");
    const hasActivatable = triggerNodes.some(
      (n) => !this.isManualTriggerType(n.type) && !this.isMissingRuntimeTriggerType(n.type),
    );
    if (hasActivatable) {
      return [];
    }
    if (triggerNodes.length === 0) {
      return ["This workflow has no trigger node. Add a non-manual trigger (for example a webhook) before activating."];
    }
    const onlyManual = triggerNodes.every((n) => this.isManualTriggerType(n.type));
    if (onlyManual) {
      return [
        "This workflow only has a manual run trigger. Add a non-manual trigger (for example a webhook) before activating.",
      ];
    }
    return [
      "This workflow has no usable automatic trigger (the configured trigger may be missing or invalid). Fix the trigger before activating.",
    ];
  }

  collectRequiredCredentialErrors(health: WorkflowCredentialHealthDto): ReadonlyArray<string> {
    const lines: string[] = [];
    for (const slot of health.slots) {
      if (slot.requirement.optional) {
        continue;
      }
      if (slot.health.status === "unbound") {
        const nodeLabel = slot.nodeName ?? slot.nodeId;
        lines.push(
          `Required credential "${slot.requirement.label}" (${slot.requirement.slotKey}) on "${nodeLabel}" is not bound.`,
        );
      }
    }
    return lines;
  }

  async collectScopeMismatchErrors(
    health: WorkflowCredentialHealthDto,
    opts: {
      getRequiredScopes: (typeId: string, slotRequirement: CredentialRequirement) => ReadonlyArray<string>;
      getGrantedScopes: (instanceId: string) => Promise<ReadonlyArray<string>>;
    },
  ): Promise<ReadonlyArray<string>> {
    const checked = new Set<string>();
    const lines: string[] = [];

    for (const slot of health.slots) {
      const { instance } = slot;
      if (!instance) {
        continue;
      }
      const { instanceId, typeId, displayName } = instance;
      if (checked.has(instanceId)) {
        continue;
      }
      checked.add(instanceId);

      const required = opts.getRequiredScopes(typeId, slot.requirement);
      if (required.length === 0) {
        continue;
      }

      const granted = await opts.getGrantedScopes(instanceId);
      const grantedSet = new Set(granted);
      const missing = required.filter((s) => !grantedSet.has(s));
      if (missing.length > 0) {
        lines.push(
          `Credential "${displayName}" missing scopes: ${missing.join(", ")}. Reconnect to grant.`,
        );
      }
    }

    return lines;
  }
}
