import {
  AllWorkflowsActiveWorkflowActivationPolicy,
  ConnectionNodeIdFactory,
  NodeBackedToolConfig,
  WorkflowBuilder,
  type ChatModelConfig,
  type ToolConfig,
  type WorkflowDefinition,
  type ZodSchemaAny,
} from "@codemation/core";
import { PersistedWorkflowTokenRegistry } from "@codemation/core/bootstrap";
import { PersistedWorkflowSnapshotFactory } from "@codemation/core/testing";
import { AIAgent, Callback, ManualTrigger, WebhookTrigger } from "@codemation/core-nodes";
import type {
  ConnectionInvocationRecord,
  PersistedRunState,
  WorkflowDebuggerOverlayState,
  WorkflowDto,
} from "@codemation/next-host/src/features/workflows/hooks/realtime/realtime";
import { WorkflowDefinitionMapper } from "../../../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../../../src/application/mapping/WorkflowPolicyUiPresentationFactory";

export type WorkflowDetailTriggerKind = "manual" | "webhook";

class WorkflowDetailFixturePassthroughSchema<TValue> {
  parse(value: TValue): TValue {
    return value;
  }
}

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

  static readonly llmNodeId = ConnectionNodeIdFactory.languageModelConnectionNodeId(this.agentNodeId);
  static readonly toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId(this.agentNodeId, "lookup_tool");
  /** Aliases for tests: LLM re-invocations share the connection node id. */
  static readonly llmFirstInvocationNodeId = this.llmNodeId;
  static readonly llmSecondInvocationNodeId = this.llmNodeId;
  static readonly toolFirstInvocationNodeId = this.toolNodeId;

  /** Coordinator agent id for {@link createNestedAgentCoordinatorWorkflowDefinition}. */
  static readonly nestedCoordinatorAgentId = "agent_root";
  /** Node-backed nested specialist tool name (matches {@link NodeBackedToolConfig#name}). */
  static readonly nestedResearchToolName = "research_agent";
  static readonly nestedInnerLookupToolName = "lookup_tool";

  static readonly nestedOuterLlmInvocationId = "cinv_nested_outer_llm";
  static readonly nestedSpecialistInvocationId = "cinv_nested_specialist";
  static readonly nestedInnerLlmInvocationId = "cinv_nested_inner_llm";
  static readonly nestedInnerToolInvocationId = "cinv_nested_inner_tool";

  static createWorkflowDefinition(options: WorkflowDetailDefinitionOptions = {}): WorkflowDefinition {
    const workflowId = options.workflowId ?? this.workflowId;
    const workflowName = options.workflowName ?? "Frontend realtime workflow";
    const triggerKind = options.triggerKind ?? "manual";
    const chatModelConfig =
      options.chatModelConfig ?? new FrontendWorkflowDetailChatModelConfig("Mock LLM", { label: "Mock LLM" });
    const toolConfigs = options.toolConfigs ?? [
      new FrontendWorkflowDetailToolConfig("lookup_tool", "Lookup tool", { label: "Lookup tool" }),
    ];

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
        new AIAgent({
          name: "Agent",
          messages: [
            { role: "system", content: "Inspect the item and use the tool when needed." },
            {
              role: "user",
              content: ({ item }) => JSON.stringify(item.json ?? {}),
            },
          ],
          chatModel: chatModelConfig,
          tools: [...toolConfigs],
          id: this.agentNodeId,
        }),
      )
      .then(new Callback("Node 2", undefined, this.nodeTwoId))
      .build();
  }

  static createWorkflowDetail(options: WorkflowDetailDefinitionOptions = {}): WorkflowDto {
    return new WorkflowDefinitionMapper(
      new WorkflowPolicyUiPresentationFactory(),
      new AllWorkflowsActiveWorkflowActivationPolicy(),
    ).mapSync(this.createWorkflowDefinition(options)) as WorkflowDto;
  }

  /**
   * Coordinator with a node-backed nested agent (inner agent + inner tool) for execution-tree depth tests.
   * Prefer this over hand-rolling workflow DTOs + connection ids in each test.
   */
  static createNestedAgentCoordinatorWorkflowDefinition(): WorkflowDefinition {
    const chatModelConfig = new FrontendWorkflowDetailChatModelConfig("Mock LLM", { label: "Mock LLM" });
    const innerAgent = new AIAgent({
      name: "Researcher",
      messages: [{ role: "user", content: "Research the current task." }],
      chatModel: chatModelConfig,
      tools: [
        new FrontendWorkflowDetailToolConfig(this.nestedInnerLookupToolName, "Lookup tool", { label: "Lookup tool" }),
      ],
    });
    const researchTool = new NodeBackedToolConfig(this.nestedResearchToolName, innerAgent, {
      description: "Nested research agent",
      inputSchema: new WorkflowDetailFixturePassthroughSchema<{ query: string }>() as unknown as ZodSchemaAny,
      outputSchema: new WorkflowDetailFixturePassthroughSchema<{ answer: string }>() as unknown as ZodSchemaAny,
    });
    return new WorkflowBuilder({
      id: `${this.workflowId}.nested`,
      name: "Nested coordinator workflow",
    })
      .trigger(new ManualTrigger("Manual trigger", this.triggerNodeId))
      .then(
        new AIAgent({
          name: "Coordinator",
          messages: [{ role: "user", content: "Coordinate the specialist." }],
          chatModel: chatModelConfig,
          tools: [researchTool],
          id: this.nestedCoordinatorAgentId,
        }),
      )
      .build();
  }

  static createNestedAgentCoordinatorWorkflowDetail(): WorkflowDto {
    return new WorkflowDefinitionMapper(
      new WorkflowPolicyUiPresentationFactory(),
      new AllWorkflowsActiveWorkflowActivationPolicy(),
    ).mapSync(this.createNestedAgentCoordinatorWorkflowDefinition()) as WorkflowDto;
  }

  static createWorkflowSnapshotFromDefinition(
    definition: WorkflowDefinition,
  ): NonNullable<PersistedRunState["workflowSnapshot"]> {
    const tokenRegistry = new PersistedWorkflowTokenRegistry();
    tokenRegistry.registerFromWorkflows([definition]);
    return new PersistedWorkflowSnapshotFactory(tokenRegistry).create(definition);
  }

  static createWorkflowSnapshot(
    options: Readonly<{ workflow?: WorkflowDto } & WorkflowDetailDefinitionOptions> = {},
  ): NonNullable<PersistedRunState["workflowSnapshot"]> {
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

  /**
   * Completed run with four connection invocations: outer LLM, specialist nested agent, inner LLM, inner tool.
   * Uses {@link ConnectionNodeIdFactory} so ids stay aligned with the mapped workflow.
   */
  static createNestedAgentCoordinatorCompletedRunState(workflow: WorkflowDto): PersistedRunState {
    const definition = this.createNestedAgentCoordinatorWorkflowDefinition();
    const runId = `${this.runId}_nested`;
    const wfId = workflow.id;
    const outerAgentId = this.nestedCoordinatorAgentId;
    const outerLlmId = ConnectionNodeIdFactory.languageModelConnectionNodeId(outerAgentId);
    const specialistToolId = ConnectionNodeIdFactory.toolConnectionNodeId(outerAgentId, this.nestedResearchToolName);
    const innerLlmId = ConnectionNodeIdFactory.languageModelConnectionNodeId(specialistToolId);
    const innerToolId = ConnectionNodeIdFactory.toolConnectionNodeId(specialistToolId, this.nestedInnerLookupToolName);

    const baseTs = "2026-03-11T12:00:00.000Z";
    const connectionInvocations: ConnectionInvocationRecord[] = [
      {
        invocationId: this.nestedOuterLlmInvocationId,
        runId,
        workflowId: wfId,
        connectionNodeId: outerLlmId,
        parentAgentNodeId: outerAgentId,
        parentAgentActivationId: "act_nested",
        status: "completed",
        managedOutput: { layer: "outer_llm" },
        updatedAt: baseTs,
      },
      {
        invocationId: this.nestedSpecialistInvocationId,
        runId,
        workflowId: wfId,
        connectionNodeId: specialistToolId,
        parentAgentNodeId: outerAgentId,
        parentAgentActivationId: "act_nested",
        status: "completed",
        managedOutput: { layer: "specialist" },
        updatedAt: baseTs,
      },
      {
        invocationId: this.nestedInnerLlmInvocationId,
        runId,
        workflowId: wfId,
        connectionNodeId: innerLlmId,
        parentAgentNodeId: specialistToolId,
        parentAgentActivationId: "act_specialist",
        status: "completed",
        managedOutput: { layer: "inner_llm" },
        updatedAt: baseTs,
      },
      {
        invocationId: this.nestedInnerToolInvocationId,
        runId,
        workflowId: wfId,
        connectionNodeId: innerToolId,
        parentAgentNodeId: specialistToolId,
        parentAgentActivationId: "act_specialist",
        status: "completed",
        managedOutput: { layer: "inner_tool" },
        updatedAt: baseTs,
      },
    ];

    return {
      ...this.createInitialRunState({
        workflow,
        workflowSnapshot: this.createWorkflowSnapshotFromDefinition(definition),
        runId,
      }),
      status: "completed",
      workflowId: wfId,
      nodeSnapshotsByNodeId: {
        [this.triggerNodeId]: this.createSnapshot(this.triggerNodeId, "completed", 0, runId, wfId),
        [outerAgentId]: this.createSnapshot(outerAgentId, "completed", 1, runId, wfId),
        [outerLlmId]: this.createSnapshot(outerLlmId, "completed", 2, runId, wfId),
        [specialistToolId]: this.createSnapshot(specialistToolId, "completed", 3, runId, wfId),
        [innerLlmId]: this.createSnapshot(innerLlmId, "completed", 4, runId, wfId),
        [innerToolId]: this.createSnapshot(innerToolId, "completed", 5, runId, wfId),
      },
      connectionInvocations,
    };
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
        [this.toolNodeId]: this.createSnapshot(this.toolNodeId, "completed", 4, runId),
        [this.llmNodeId]: this.createSnapshot(this.llmNodeId, "completed", 5, runId),
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
            stack:
              "Execution failed while rendering preview output.\nReason: upstream API rejected the payload.\nHint: inspect the input tab.",
          },
        },
      },
    };
  }

  static createPinnedMutableRunStateForNode(
    nodeId: string,
    options: Omit<WorkflowDetailRunStateOptions, "mode"> = {},
  ): PersistedRunState {
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
    workflowId: string = this.workflowId,
  ): PersistedRunState["nodeSnapshotsByNodeId"][string] {
    const timestamp = this.timestamp(step);
    return {
      runId,
      workflowId,
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
      connectionInvocations: [],
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
