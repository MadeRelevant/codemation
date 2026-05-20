import type {
  CredentialBinding,
  CredentialBindingKey,
  CredentialInstanceId,
  CredentialRequirement,
  WorkflowDefinition,
  WorkflowRepository,
} from "@codemation/core";

import { CoreTokens, CredentialUnboundError, inject, injectable } from "@codemation/core";

import { ApplicationRequestError } from "../../application/ApplicationRequestError";

import type {
  WorkflowCredentialHealthDto,
  WorkflowCredentialHealthSlotDto,
} from "../../application/contracts/CredentialContractsRegistry";

import { ApplicationTokens } from "../../applicationTokens";
import type { Logger, LoggerFactory } from "../../application/logging/Logger";

import { WorkflowCredentialNodeResolver } from "./WorkflowCredentialNodeResolver";
import { CredentialInstanceService } from "./CredentialInstanceService";
import type { CredentialStore, MutableCredentialSessionService } from "./CredentialServices";

@injectable()
export class CredentialBindingService {
  private readonly logger: Logger;

  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(CoreTokens.WorkflowRepository)
    private readonly workflowRepository: WorkflowRepository,
    @inject(CoreTokens.CredentialSessionService)
    private readonly credentialSessionService: MutableCredentialSessionService,
    @inject(WorkflowCredentialNodeResolver)
    private readonly workflowCredentialNodeResolver: WorkflowCredentialNodeResolver,
    @inject(ApplicationTokens.LoggerFactory)
    loggerFactory: LoggerFactory,
  ) {
    this.logger = loggerFactory.create("CredentialBindingService");
  }

  async upsertBinding(
    args: Readonly<{ workflowId: string; nodeId: string; slotKey: string; instanceId: CredentialInstanceId }>,
  ): Promise<CredentialBinding> {
    const workflow = this.requireWorkflow(args.workflowId);
    const requirement = this.requireRequirement(workflow, args.nodeId, args.slotKey);
    const instance = await this.credentialInstanceService.requireInstance(args.instanceId);
    if (!requirement.acceptedTypes.includes(instance.typeId)) {
      throw new ApplicationRequestError(
        400,
        `Credential instance ${instance.instanceId} (${instance.typeId}) is not compatible with slot ${args.slotKey}. Accepted types: ${requirement.acceptedTypes.join(", ")}`,
      );
    }
    const binding: CredentialBinding = {
      key: {
        workflowId: args.workflowId,
        nodeId: args.nodeId,
        slotKey: args.slotKey,
      },
      instanceId: args.instanceId,
      updatedAt: new Date().toISOString(),
    };
    await this.credentialStore.upsertBinding(binding);
    this.credentialSessionService.evictBinding(binding.key);
    return binding;
  }

  async assertRequiredCredentialsBound(workflowId: string): Promise<void> {
    const workflow = this.requireWorkflow(workflowId);
    const bindings = await this.credentialStore.listBindingsByWorkflowId(workflowId);
    const boundKeys = new Set(bindings.map((b) => this.toBindingKeyString(b.key)));
    const unboundByDb = this.workflowCredentialNodeResolver
      .listSlots(workflow)
      .filter((slot) => !slot.requirement.optional)
      .filter(
        (slot) =>
          !boundKeys.has(
            this.toBindingKeyString({ workflowId, nodeId: slot.nodeId, slotKey: slot.requirement.slotKey }),
          ),
      );
    if (unboundByDb.length === 0) return;
    // Confirm each apparently-unbound slot by attempting session resolution. A custom
    // CredentialSessionService (e.g. a test harness) can satisfy slots that have no DB
    // binding row; only slots that still fail are truly unresolvable.
    const confirmed = [];
    for (const slot of unboundByDb) {
      try {
        await this.credentialSessionService.getSession({
          workflowId,
          nodeId: slot.nodeId,
          slotKey: slot.requirement.slotKey,
        });
      } catch (error) {
        if (!(error instanceof CredentialUnboundError)) {
          this.logger.debug(
            `CredentialBindingService: unexpected error resolving session for slot ${slot.requirement.slotKey} on ${slot.nodeId}`,
            error instanceof Error ? error : undefined,
          );
        }
        confirmed.push(slot);
      }
    }
    if (confirmed.length === 0) return;
    const descriptions = confirmed
      .map((slot) => `"${slot.requirement.label}" on ${slot.nodeName ?? slot.nodeId}`)
      .join(", ");
    throw new ApplicationRequestError(
      400,
      `Cannot run workflow: required credential slot${confirmed.length > 1 ? "s" : ""} not bound: ${descriptions}`,
    );
  }

  async listWorkflowHealth(workflowId: string): Promise<WorkflowCredentialHealthDto> {
    const workflow = this.requireWorkflow(workflowId);
    const bindings = await this.credentialStore.listBindingsByWorkflowId(workflowId);
    const bindingsByKey = new Map(bindings.map((binding) => [this.toBindingKeyString(binding.key), binding] as const));
    const slots: WorkflowCredentialHealthSlotDto[] = [];
    for (const slotRef of this.workflowCredentialNodeResolver.listSlots(workflow)) {
      const requirement = slotRef.requirement;
      const bindingKey = {
        workflowId,
        nodeId: slotRef.nodeId,
        slotKey: requirement.slotKey,
      } satisfies CredentialBindingKey;
      const binding = bindingsByKey.get(this.toBindingKeyString(bindingKey));
      if (!binding) {
        slots.push({
          workflowId,
          nodeId: slotRef.nodeId,
          nodeName: slotRef.nodeName,
          requirement,
          health: {
            status: requirement.optional ? "optional-unbound" : "unbound",
          },
        });
        continue;
      }
      const instance = await this.credentialInstanceService.requireInstance(binding.instanceId);
      const latestTestResult = await this.credentialStore.getLatestTestResult(instance.instanceId);
      slots.push({
        workflowId,
        nodeId: slotRef.nodeId,
        nodeName: slotRef.nodeName,
        requirement,
        instance: {
          instanceId: instance.instanceId,
          typeId: instance.typeId,
          displayName: instance.displayName,
          setupStatus: instance.setupStatus,
        },
        health: {
          status: latestTestResult?.health.status ?? "unknown",
          message: latestTestResult?.health.message,
          testedAt: latestTestResult?.health.testedAt,
        },
      });
    }
    return {
      workflowId,
      slots,
    };
  }

  private requireWorkflow(workflowId: string): WorkflowDefinition {
    const workflow = this.workflowRepository.get(decodeURIComponent(workflowId));
    if (!workflow) {
      throw new ApplicationRequestError(404, `Unknown workflowId: ${workflowId}`);
    }
    return workflow;
  }

  private requireRequirement(workflow: WorkflowDefinition, nodeId: string, slotKey: string): CredentialRequirement {
    const resolved = this.workflowCredentialNodeResolver.findRequirement(workflow, nodeId, slotKey);
    if (!resolved) {
      if (!this.workflowCredentialNodeResolver.isCredentialNodeIdInWorkflow(workflow, nodeId)) {
        throw new ApplicationRequestError(404, `Unknown workflow node: ${nodeId}`);
      }
      throw new ApplicationRequestError(400, `Node ${nodeId} does not declare credential slot ${slotKey}.`);
    }
    return resolved.requirement;
  }

  private toBindingKeyString(bindingKey: CredentialBindingKey): string {
    return `${bindingKey.workflowId}:${bindingKey.nodeId}:${bindingKey.slotKey}`;
  }
}
