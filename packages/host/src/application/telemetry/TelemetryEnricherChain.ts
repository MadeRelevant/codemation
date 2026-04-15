import type { WorkflowDefinition } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowDefinitionRepository } from "../../domain/workflows/WorkflowDefinitionRepository";

export interface TelemetryNodeMetadata {
  readonly workflowFolder?: string;
  readonly nodeType?: string;
  readonly nodeRole?: string;
}

@injectable()
export class TelemetryEnricherChain {
  private readonly definitionsByWorkflowId = new Map<string, WorkflowDefinition | null>();

  constructor(
    @inject(ApplicationTokens.WorkflowDefinitionRepository)
    private readonly workflowDefinitionRepository: WorkflowDefinitionRepository,
  ) {}

  async enrichNode(args: Readonly<{ workflowId: string; nodeId: string }>): Promise<TelemetryNodeMetadata> {
    const workflow = await this.loadDefinition(args.workflowId);
    if (!workflow) {
      return {};
    }
    const node = workflow.nodes.find((entry) => entry.id === args.nodeId);
    if (!node) {
      return {
        workflowFolder: this.toWorkflowFolder(workflow),
      };
    }
    return {
      workflowFolder: this.toWorkflowFolder(workflow),
      nodeType: this.toNodeType(node),
      nodeRole: this.toNodeRole(workflow, args.nodeId),
    };
  }

  async enrichRun(workflowId: string): Promise<Readonly<{ workflowFolder?: string }>> {
    const workflow = await this.loadDefinition(workflowId);
    return {
      workflowFolder: workflow ? this.toWorkflowFolder(workflow) : undefined,
    };
  }

  private async loadDefinition(workflowId: string): Promise<WorkflowDefinition | undefined> {
    const key = decodeURIComponent(workflowId);
    if (this.definitionsByWorkflowId.has(key)) {
      return this.definitionsByWorkflowId.get(key) ?? undefined;
    }
    const loaded = (await this.workflowDefinitionRepository.getDefinition(key)) ?? null;
    this.definitionsByWorkflowId.set(key, loaded);
    return loaded ?? undefined;
  }

  private toWorkflowFolder(workflow: WorkflowDefinition): string | undefined {
    const segments = workflow.discoveryPathSegments ?? [];
    if (segments.length === 0) {
      return undefined;
    }
    return segments.slice(0, -1).join("/");
  }

  private toNodeType(node: WorkflowDefinition["nodes"][number]): string | undefined {
    const token = node.type;
    if (typeof token === "function" && token.name) {
      return token.name;
    }
    if (typeof token === "symbol") {
      return token.description ?? token.toString();
    }
    return undefined;
  }

  private toNodeRole(workflow: WorkflowDefinition, nodeId: string): string {
    const connection = workflow.connections?.find((entry) => entry.childNodeIds.includes(nodeId));
    if (!connection) {
      return "workflowNode";
    }
    if (connection.connectionName === "llm") {
      return "languageModel";
    }
    return "tool";
  }
}
