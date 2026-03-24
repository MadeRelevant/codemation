import type { CredentialRequirement } from "@codemation/core";
import { inject,injectable } from "@codemation/core";
import type { CodemationBootContext,CodemationBootHook } from "@codemation/host";
import { CredentialBindingService,CredentialInstanceService } from "@codemation/host/credentials";

type WorkflowCredentialSlot = Readonly<{
  workflowId: string;
  nodeId: string;
  requirement: CredentialRequirement;
}>;

@injectable()
export class TestDevCredentialBootstrap implements CodemationBootHook {
  private static readonly gmailCredentialTypeId = "gmail.serviceAccount";
  private static readonly openAiCredentialTypeId = "openai.apiKey";
  private static readonly gmailCredentialDisplayName = "Test-dev Gmail service account";
  private static readonly openAiCredentialDisplayName = "Test-dev OpenAI API key";

  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(CredentialBindingService)
    private readonly credentialBindingService: CredentialBindingService,
  ) {}

  async boot(context: CodemationBootContext): Promise<void> {
    this.registerOpenAiCredentialType(context);
    await this.ensureOpenAiCredentialBinding(context);
    await this.ensureGmailCredentialBinding(context);
  }

  private registerOpenAiCredentialType(context: CodemationBootContext): void {
    context.application.registerCredentialType({
      definition: {
        typeId: TestDevCredentialBootstrap.openAiCredentialTypeId,
        displayName: "OpenAI API key",
        description: "API key credentials for OpenAI-backed chat model sessions.",
        secretFields: [
          { key: "apiKey", label: "API key", type: "password", required: true },
        ],
        supportedSourceKinds: ["db", "env", "code"],
      },
      createSession: async (args) => {
        return String(args.material.apiKey ?? "");
      },
      test: async (args) => {
        const apiKey = String(args.material.apiKey ?? "").trim();
        return apiKey.length > 0
          ? {
              status: "healthy",
              message: "Resolved OpenAI API key successfully.",
              testedAt: new Date().toISOString(),
            }
          : {
              status: "failing",
              message: "OpenAI API key is empty.",
              testedAt: new Date().toISOString(),
            };
      },
    });
  }

  private async ensureOpenAiCredentialBinding(context: CodemationBootContext): Promise<void> {
    const slot = this.findWorkflowCredentialSlot(context, "wf.example", TestDevCredentialBootstrap.openAiCredentialTypeId);
    if (!slot) {
      return;
    }
    try {
      const instanceId = await this.ensureEnvCredentialInstance({
        displayName: TestDevCredentialBootstrap.openAiCredentialDisplayName,
        typeId: TestDevCredentialBootstrap.openAiCredentialTypeId,
        envSecretRefs: {
          apiKey: "OPENAI_API_KEY",
        },
      });
      await this.credentialBindingService.upsertBinding({
        workflowId: slot.workflowId,
        nodeId: slot.nodeId,
        slotKey: slot.requirement.slotKey,
        instanceId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Unknown credential type")) {
        return;
      }
      throw error;
    }
  }

  private async ensureGmailCredentialBinding(context: CodemationBootContext): Promise<void> {
    const slot = this.findWorkflowCredentialSlot(context, "wf.gmail.pull", TestDevCredentialBootstrap.gmailCredentialTypeId);
    if (!slot) {
      return;
    }
    try {
      const instanceId = await this.ensureEnvCredentialInstance({
        displayName: TestDevCredentialBootstrap.gmailCredentialDisplayName,
        typeId: TestDevCredentialBootstrap.gmailCredentialTypeId,
        envSecretRefs: {
          clientEmail: "GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL",
          privateKey: "GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY",
          projectId: "GMAIL_SERVICE_ACCOUNT_PROJECT_ID",
          delegatedUser: this.resolveGmailDelegatedUserVariable(context),
        },
      });
      await this.credentialBindingService.upsertBinding({
        workflowId: slot.workflowId,
        nodeId: slot.nodeId,
        slotKey: slot.requirement.slotKey,
        instanceId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Unknown credential type")) {
        return;
      }
      throw error;
    }
  }

  private resolveGmailDelegatedUserVariable(context: CodemationBootContext): string {
    return context.env.GMAIL_SERVICE_ACCOUNT_DELEGATED_USER ? "GMAIL_SERVICE_ACCOUNT_DELEGATED_USER" : "GMAIL_TRIGGER_MAILBOX";
  }

  private async ensureEnvCredentialInstance(args: Readonly<{
    displayName: string;
    typeId: string;
    envSecretRefs: Readonly<Record<string, string>>;
  }>): Promise<string> {
    const existingInstance = (await this.credentialInstanceService.listInstances()).find(
      (instance) => instance.typeId === args.typeId && instance.displayName === args.displayName,
    );
    if (existingInstance) {
      return existingInstance.instanceId;
    }
    const createdInstance = await this.credentialInstanceService.create({
      typeId: args.typeId,
      displayName: args.displayName,
      sourceKind: "env",
      envSecretRefs: args.envSecretRefs,
      tags: ["seeded", "test-dev"],
    });
    return createdInstance.instanceId;
  }

  private findWorkflowCredentialSlot(
    context: CodemationBootContext,
    workflowId: string,
    acceptedType: string,
  ): WorkflowCredentialSlot | undefined {
    const workflow = context.discoveredWorkflows.find((candidate) => candidate.id === workflowId);
    if (!workflow) {
      return undefined;
    }
    for (const node of workflow.nodes) {
      for (const requirement of node.config.getCredentialRequirements?.() ?? []) {
        if (requirement.acceptedTypes.includes(acceptedType)) {
          return {
            workflowId,
            nodeId: node.id,
            requirement,
          };
        }
      }
    }
    return undefined;
  }
}
