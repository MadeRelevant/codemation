
import type {
CredentialBinding,
CredentialBindingKey,
CredentialInstanceId,
CredentialRequirement,
WorkflowDefinition,
WorkflowRegistry
} from "@codemation/core";

import { CoreTokens,inject,injectable } from "@codemation/core";

import { ApplicationRequestError } from "../../application/ApplicationRequestError";

import type {
WorkflowCredentialHealthDto,
WorkflowCredentialHealthSlotDto
} from "../../application/contracts/CredentialContracts";

import { ApplicationTokens } from "../../applicationTokens";

import { CredentialInstanceService } from "./CredentialInstanceService";
import type { CredentialStore,MutableCredentialSessionService } from "./CredentialServices";

@injectable()
export class CredentialBindingService {
  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(CoreTokens.WorkflowRegistry)
    private readonly workflowRegistry: WorkflowRegistry,
    @inject(CoreTokens.CredentialSessionService)
    private readonly credentialSessionService: MutableCredentialSessionService,
  ) {}

  async upsertBinding(args: Readonly<{ workflowId: string; nodeId: string; slotKey: string; instanceId: CredentialInstanceId }>): Promise<CredentialBinding> {
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

  async listWorkflowHealth(workflowId: string): Promise<WorkflowCredentialHealthDto> {
    const workflow = this.requireWorkflow(workflowId);
    const bindings = await this.credentialStore.listBindingsByWorkflowId(workflowId);
    const bindingsByKey = new Map(bindings.map((binding) => [this.toBindingKeyString(binding.key), binding] as const));
    const slots: WorkflowCredentialHealthSlotDto[] = [];
    for (const node of workflow.nodes) {
      const requirements = node.config.getCredentialRequirements?.() ?? [];
      for (const requirement of requirements) {
        const bindingKey = {
          workflowId,
          nodeId: node.id,
          slotKey: requirement.slotKey,
        } satisfies CredentialBindingKey;
        const binding = bindingsByKey.get(this.toBindingKeyString(bindingKey));
        if (!binding) {
          slots.push({
            workflowId,
            nodeId: node.id,
            nodeName: node.name ?? node.config.name,
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
          nodeId: node.id,
          nodeName: node.name ?? node.config.name,
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
    }
    return {
      workflowId,
      slots,
    };
  }

  private requireWorkflow(workflowId: string): WorkflowDefinition {
    const workflow = this.workflowRegistry.get(decodeURIComponent(workflowId));
    if (!workflow) {
      throw new ApplicationRequestError(404, `Unknown workflowId: ${workflowId}`);
    }
    return workflow;
  }

  private requireRequirement(workflow: WorkflowDefinition, nodeId: string, slotKey: string): CredentialRequirement {
    const node = workflow.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      throw new ApplicationRequestError(404, `Unknown workflow node: ${nodeId}`);
    }
    const requirement = (node.config.getCredentialRequirements?.() ?? []).find((entry) => entry.slotKey === slotKey);
    if (!requirement) {
      throw new ApplicationRequestError(400, `Node ${nodeId} does not declare credential slot ${slotKey}.`);
    }
    return requirement;
  }

  private toBindingKeyString(bindingKey: CredentialBindingKey): string {
    return `${bindingKey.workflowId}:${bindingKey.nodeId}:${bindingKey.slotKey}`;
  }
}
