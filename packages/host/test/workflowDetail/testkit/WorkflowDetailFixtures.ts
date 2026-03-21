import {
AgentAttachmentNodeIdFactory,
PersistedWorkflowSnapshotFactory,
PersistedWorkflowTokenRegistry,
WorkflowBuilder,
type ChatModelConfig,
type ToolConfig,
type WorkflowDefinition,
} from "@codemation/core";
import { AIAgent,Callback,ManualTrigger,WebhookTrigger } from "@codemation/core-nodes";
import type { PersistedRunState,WorkflowDebuggerOverlayState,WorkflowDto } from "@codemation/next-host/src/ui/realtime/realtime";
import { WorkflowDefinitionMapper } from "../../../src/application/mapping/WorkflowDefinitionMapper";

export type WorkflowDetailTriggerKind = "manual" | "webhook";

export type WorkflowDetailDefinitionOptions = Readonly<{
  workflowId?: string;
  workflowName?: string;
  triggerKind?: WorkflowDetailTriggerKind;
  chatModelConfig?: ChatModelConfig;
  toolConfigs?: ReadonlyArray<ToolConfig>;
}>;

export type WorkflowDetailRunStateOptions = Readonly<{
  mode?: "manual" | "debug";
  runId?: string;
  workflow?: WorkflowDto;
  workflowId?: string;
  workflowSnapshot?: NonNullable<PersistedRunState["workflowSnapshot"]>;
  startedAt?: string;
}>;

class FrontendWorkflowDetailChatModelFactory {}

class FrontendWorkflowDetailTool {}

class FrontendWorkflowDetailChatModelConfig implements ChatModelConfig {
  readonly type = FrontendWorkflowDetailChatModelFactory as ChatModelConfig["type"];

  constructor(
    public readonly name: string,
    public readonly presentation?: ChatModelConfig["presentation"],
  ) {}
}

class FrontendWorkflowDetailToolConfig implements ToolConfig {
  readonly type = FrontendWorkflowDetailTool as ToolConfig["type"];

  constructor(
    public readonly name: string,
    public readonly description?: string,
    public readonly presentation?: ToolConfig["presentation"],
  ) {}
}

export class WorkflowDetailFixtureFactory {
  static readonly workflowId = "wf.frontend.realtime";
  static readonly runId = "run_frontend_1";
  static readonly triggerNodeId = "trigger";
  static readonly nodeOneId = "node_1";
  static readonly agentNodeId = "agent";
  static readonly nodeTwoId = "node_2";
  static readonly startedAt = "2026-03-11T12:00:00.000Z";

  static readonly llmNodeId = AgentAttachmentNodeIdFactory.createLanguageModelNodeId(this.agentNodeId);
  static readonly toolNodeId = AgentAttachmentNodeIdFactory.createToolNodeId(this.agentNodeId, "lookup_tool");
  static readonly llmFirstInvocationNodeId = AgentAttachmentNodeIdFactory.createLanguageModelNodeId(this.agentNodeId, 1);
  static readonly llmSecondInvocationNodeId = AgentAttachmentNodeIdFactory.createLanguageModelNodeId(this.agentNodeId, 2);
  static readonly toolFirstInvocationNodeId = AgentAttachmentNodeIdFactory.createToolNodeId(this.agentNodeId, "lookup_tool", 1);

  static createWorkflowDefinition(options: WorkflowDetailDefinitionOptions = {}): WorkflowDefinition {
    const workflowId = options.workflowId ?? this.workflowId;
    const workflowName = options.workflowName ?? "Frontend realtime workflow";
    const triggerKind = options.triggerKind ?? "manual";
    const chatModelConfig = options.chatModelConfig ?? new FrontendWorkflowDetailChatModelConfig("Mock LLM", { label: "Mock LLM" });
    const toolConfigs = options.toolConfigs ?? [new FrontendWorkflowDetailToolConfig("lookup_tool", "Lookup tool", { label: "Lookup tool" })];

    const builder = new WorkflowBuilder({ id: workflowId, name: workflowName });
    if (triggerKind === "webhook") {
      return builder
        .trigger(
          new WebhookTrigger(
            "Webhook trigger",
            {
              endpointKey: "incoming",
              methods: ["POST"],
            },
            undefined,
            this.triggerNodeId,
          ),
        )
        .build();
    }

    return builder
      .trigger(new ManualTrigger("Manual trigger", this.triggerNodeId))
      .then(new Callback("Node 1", undefined, this.nodeOneId))
      .then(
        new AIAgent(
          "Agent",
          "Inspect the item and use the tool when needed.",
          (item) => JSON.stringify(item.json ?? {}),
          chatModelConfig,
          [...toolConfigs],
          this.agentNodeId,
        ),
      )
      .then(new Callback("Node 2", undefined, this.nodeTwoId))
      .build();
  }

  static createWorkflowDetail(options: WorkflowDetailDefinitionOptions = {}): WorkflowDto {
    return new WorkflowDefinitionMapper().mapSync(this.createWorkflowDefinition(options)) as WorkflowDto;
  }

  static createWorkflowSnapshot(options: Readonly<{ workflow?: WorkflowDto } & WorkflowDetailDefinitionOptions> = {}): NonNullable<PersistedRunState["workflowSnapshot"]> {
    const workflow = options.workflow
      ? this.createWorkflowDefinition({
          workflowId: options.workflow.id,
          workflowName: options.workflow.name,
          triggerKind: this.isWebhookWorkflow(options.workflow) ? "webhook" : "manual",
        })
      : this.createWorkflowDefinition(options);
    const tokenRegistry = new PersistedWorkflowTokenRegistry();
    tokenRegistry.registerFromWorkflows([workflow]);
    return new PersistedWorkflowSnapshotFactory(tokenRegistry).create(workflow);
  }

  static createInitialRunState(options: WorkflowDetailRunStateOptions = {}): PersistedRunState {
    const workflow = options.workflow;
    const workflowId = workflow?.id ?? options.workflowId ?? this.workflowId;
    const mode = options.mode;
    return {
      runId: options.runId ?? this.runId,
      workflowId,
      startedAt: options.startedAt ?? this.startedAt,
      executionOptions: mode ? { mode, sourceWorkflowId: workflowId } : undefined,
      workflowSnapshot: options.workflowSnapshot ?? this.createWorkflowSnapshot({ workflow }),
      mutableState: undefined,
      status: "pending",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
    };
  }

  static createCompletedRunState(options: WorkflowDetailRunStateOptions = {}): PersistedRunState {
    const runId = options.runId ?? this.runId;
    return {
      ...this.createInitialRunState({ ...options, runId }),
      status: "completed",
      nodeSnapshotsByNodeId: {
        [this.triggerNodeId]: this.createSnapshot(this.triggerNodeId, "completed", 0, runId),
        [this.nodeOneId]: this.createSnapshot(this.nodeOneId, "completed", 1, runId),
        [this.agentNodeId]: this.createSnapshot(this.agentNodeId, "completed", 2, runId),
        [this.llmFirstInvocationNodeId]: this.createSnapshot(this.llmFirstInvocationNodeId, "completed", 3, runId),
        [this.toolFirstInvocationNodeId]: this.createSnapshot(this.toolFirstInvocationNodeId, "completed", 4, runId),
        [this.llmSecondInvocationNodeId]: this.createSnapshot(this.llmSecondInvocationNodeId, "completed", 5, runId),
        [this.nodeTwoId]: this.createSnapshot(this.nodeTwoId, "completed", 6, runId),
      },
    };
  }

  static createFailedRunState(options: Omit<WorkflowDetailRunStateOptions, "mode"> = {}): PersistedRunState {
    const runId = options.runId ?? this.runId;
    return {
      ...this.createInitialRunState({ ...options, runId }),
      status: "failed",
      nodeSnapshotsByNodeId: {
        [this.nodeOneId]: {
          ...this.createSnapshot(this.nodeOneId, "failed", 1, runId),
          error: {
            name: "NodeExecutionError",
            message: "Execution failed while rendering preview output.",
            stack: "Execution failed while rendering preview output.\nReason: upstream API rejected the payload.\nHint: inspect the input tab.",
          },
        },
      },
    };
  }

  static createPinnedMutableRunStateForNode(nodeId: string, options: Omit<WorkflowDetailRunStateOptions, "mode"> = {}): PersistedRunState {
    return {
      ...this.createCompletedRunState({ ...options, mode: "manual" }),
      mutableState: {
        nodesById: {
          [nodeId]: {
            pinnedOutputsByPort: { main: [{ json: { pinned: true } }] },
          },
        },
      },
    };
  }

  static createSnapshot(
    nodeId: string,
    status: PersistedRunState["nodeSnapshotsByNodeId"][string]["status"],
    step: number,
    runId = this.runId,
  ): PersistedRunState["nodeSnapshotsByNodeId"][string] {
    const timestamp = this.timestamp(step);
    return {
      runId,
      workflowId: this.workflowId,
      nodeId,
      status,
      queuedAt: status === "running" ? timestamp : undefined,
      startedAt: status === "running" || status === "completed" ? timestamp : undefined,
      finishedAt: status === "completed" ? timestamp : undefined,
      updatedAt: timestamp,
      inputsByPort: { in: [{ json: this.createStructuredValue(step, "input") }] },
      outputs: status === "completed" ? { main: [{ json: this.createStructuredValue(step, "output") }] } : undefined,
    };
  }

  static createDerivedRunId(runId = this.runId): string {
    return `${runId}_derived`;
  }

  static createDebuggerOverlayState(
    workflowId = this.workflowId,
    currentState: WorkflowDebuggerOverlayState["currentState"] = {
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      mutableState: {
        nodesById: {},
      },
    },
  ): WorkflowDebuggerOverlayState {
    return {
      workflowId,
      updatedAt: this.startedAt,
      currentState,
    };
  }

  private static createStructuredValue(step: number, phase: "input" | "output"): Readonly<Record<string, unknown>> {
    return {
      step,
      phase,
      subject: `${phase.toUpperCase()} subject ${step}`,
      body: `Body line 1 (${phase} ${step})\nBody line 2 (${phase} ${step})`,
      metadata: {
        source: "workflow-detail-test",
        phase,
      },
    };
  }

  private static timestamp(step: number): string {
    const second = String(step).padStart(2, "0");
    return `2026-03-11T12:00:${second}.000Z`;
  }

  private static isWebhookWorkflow(workflow: WorkflowDto): boolean {
    const firstTrigger = workflow.nodes.find((node) => node.kind === "trigger");
    return firstTrigger?.type === "WebhookTriggerNode";
  }
}
