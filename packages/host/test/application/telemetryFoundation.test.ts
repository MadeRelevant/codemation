import {
  type TelemetryArtifactAttachment,
  CoreTokens,
  type ChatModelConfig as CoreChatModelConfig,
  chatModel,
  tool,
  type ChatModelConfig,
  type ChatModelFactory,
  type LangChainChatModelLike,
  type RunResult,
  type Tool,
  type ToolConfig,
  type ToolExecuteArgs,
} from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { AIAgent, ManualTrigger, MapData, createWorkflowBuilder } from "@codemation/core-nodes";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RunEventBusTelemetryReporter } from "../../src/application/telemetry/RunEventBusTelemetryReporter";
import { TelemetryPrivacyPolicy } from "../../src/application/telemetry/TelemetryPrivacyPolicy";
import {
  TelemetryQueryService,
  type TelemetryAiAggregate,
  type TelemetryRunAggregate,
  type TelemetryRunTraceView,
} from "../../src/application/telemetry/TelemetryQueryService";
import { AppContainerFactory } from "../../src/bootstrap/AppContainerFactory";
import { AppContainerLifecycle } from "../../src/bootstrap/AppContainerLifecycle";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

type CompletedRunResult = Extract<RunResult, { status: "completed" }>;

type TelemetryOutcomeResult = Readonly<{
  runResult: CompletedRunResult;
  runAggregate: TelemetryRunAggregate;
  aiAggregate: TelemetryAiAggregate;
  traceView: TelemetryRunTraceView;
}>;

interface TelemetryLookupInput {
  readonly subject: string;
  readonly body: string;
}

interface TelemetryLookupOutput {
  readonly isRfq: boolean;
  readonly reason: string;
}

class TelemetryLookupToolSchema {
  static readonly input = z.object({
    subject: z.string(),
    body: z.string(),
  });

  static readonly output = z.object({
    isRfq: z.boolean(),
    reason: z.string(),
  });
}

@tool({ packageName: "@codemation/host-test" })
class TelemetryLookupTool implements Tool<
  TelemetryLookupToolConfig,
  typeof TelemetryLookupToolSchema.input,
  typeof TelemetryLookupToolSchema.output
> {
  readonly defaultDescription = "Check whether the current message is an RFQ.";
  readonly inputSchema = TelemetryLookupToolSchema.input;
  readonly outputSchema = TelemetryLookupToolSchema.output;

  execute(args: ToolExecuteArgs<TelemetryLookupToolConfig, TelemetryLookupInput>): TelemetryLookupOutput {
    const haystack = `${args.input.subject}\n${args.input.body}`.toUpperCase();
    return {
      isRfq: haystack.includes("RFQ"),
      reason: "subject/body contains RFQ",
    };
  }
}

class TelemetryLookupToolConfig implements ToolConfig {
  readonly type = TelemetryLookupTool;

  constructor(
    public readonly name: string,
    public readonly description = "Detect RFQ-like messages.",
  ) {}
}

@chatModel({ packageName: "@codemation/host-test" })
class TelemetryScriptedChatModelFactory implements ChatModelFactory<ChatModelConfig> {
  create(args: Readonly<{ config: ChatModelConfig }>): LangChainChatModelLike {
    const config = args.config as TelemetryScriptedChatModelConfig;
    return new TelemetryScriptedChatModel(config.responses);
  }
}

class TelemetryScriptedChatModelConfig implements ChatModelConfig {
  readonly type = TelemetryScriptedChatModelFactory as CoreChatModelConfig["type"];

  constructor(
    public readonly name: string,
    public readonly responses: ReadonlyArray<unknown>,
  ) {}
}

class TelemetryScriptedChatModel implements LangChainChatModelLike {
  private invocationCount = 0;

  constructor(private readonly responses: ReadonlyArray<unknown>) {}

  bindTools(): LangChainChatModelLike {
    return this;
  }

  async invoke(): Promise<unknown> {
    const response = this.responses[this.invocationCount] ?? this.responses[this.responses.length - 1];
    this.invocationCount += 1;
    return response ?? { content: "" };
  }
}

class CapturingTelemetryPrivacyPolicy extends TelemetryPrivacyPolicy {
  shouldCaptureArtifact(_: TelemetryArtifactAttachment): boolean {
    return true;
  }
}

class TelemetryToolCallResponseFactory {
  static create(id: string, name: string, input: unknown): Readonly<Record<string, unknown>> {
    return {
      content: "planning tool call",
      tool_calls: [{ id, name, args: input }],
    };
  }
}

class TelemetryWorkflowFixtureFactory {
  static readonly workflowId = "wf.telemetry.outcome";
  static readonly workflowName = "Telemetry outcome workflow";
  static readonly modelName = "demo-gpt";

  static createWorkflow() {
    const workflow = createWorkflowBuilder({
      id: this.workflowId,
      name: this.workflowName,
    })
      .trigger(new ManualTrigger("Start", "trigger"))
      .then(
        new MapData<{ subject: string; body: string }, { subject: string; body: string; normalized: true }>(
          "Normalize input",
          (item) => ({
            subject: item.json.subject,
            body: item.json.body,
            normalized: true,
          }),
          { id: "map_normalize" },
        ),
      )
      .then(
        new AIAgent({
          id: "agent_main",
          name: "RFQ agent",
          messages: [
            { role: "system", content: "Use the lookup tool before returning JSON." },
            { role: "user", content: "Review the message and decide whether it is an RFQ." },
          ],
          chatModel: new TelemetryScriptedChatModelConfig(this.modelName, this.createModelResponses()),
          tools: [new TelemetryLookupToolConfig("rfq_lookup")],
        }),
      )
      .then(
        new MapData<
          { classification?: string; summary?: string },
          { status: string; classification: string; summary: string }
        >(
          "Finalize output",
          (item) => ({
            status: "done",
            classification: String(item.json.classification ?? "unknown"),
            summary: String(item.json.summary ?? ""),
          }),
          { id: "map_finalize" },
        ),
      )
      .build();

    return {
      ...workflow,
      discoveryPathSegments: ["telemetry", "demo", "outcome-workflow"],
    };
  }

  static createItems() {
    return [
      {
        json: {
          subject: "RFQ for 500 bolts",
          body: "Please quote 500 stainless steel bolts by Friday.",
        },
      },
    ] as const;
  }

  static createModelResponses(): ReadonlyArray<unknown> {
    return [
      TelemetryToolCallResponseFactory.create("tool-call-1", "rfq_lookup", {
        subject: "RFQ for 500 bolts",
        body: "Please quote 500 stainless steel bolts by Friday.",
      }),
      {
        content: JSON.stringify({
          classification: "rfq",
          summary: "RFQ qualified and ready for follow-up.",
        }),
        usage_metadata: {
          input_tokens: 21,
          output_tokens: 9,
          total_tokens: 30,
          input_token_details: {
            cached_tokens: 5,
          },
          output_token_details: {
            reasoning_tokens: 2,
          },
        },
      },
    ];
  }
}

class TelemetryAppConfigFactory {
  create(): AppConfig {
    return {
      consumerRoot: "/tmp/codemation-telemetry-consumer",
      repoRoot: "/tmp/codemation-telemetry-repo",
      env: {
        NODE_ENV: "test",
        AUTH_SECRET: "test-secret",
      },
      workflowSources: [],
      workflows: [TelemetryWorkflowFixtureFactory.createWorkflow()],
      containerRegistrations: [
        { token: TelemetryScriptedChatModelFactory, useClass: TelemetryScriptedChatModelFactory },
        { token: TelemetryLookupTool, useClass: TelemetryLookupTool },
        { token: TelemetryPrivacyPolicy, useClass: CapturingTelemetryPrivacyPolicy },
      ],
      credentialTypes: [],
      plugins: [],
      hasConfiguredCredentialSessionServiceRegistration: false,
      persistence: { kind: "none" },
      scheduler: { kind: "local", workerQueues: [] },
      eventing: { kind: "memory" },
      auth: {
        kind: "local",
        allowUnauthenticatedInDevelopment: false,
      },
      whitelabel: {},
      webSocketPort: 3001,
      webSocketBindHost: "127.0.0.1",
    };
  }
}

class TelemetryEventually {
  constructor(private readonly queryService: TelemetryQueryService) {}

  async waitForObservedTelemetry(runId: string): Promise<TelemetryRunTraceView> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const traceView = await this.queryService.loadRunTrace(runId);
      const hasWorkflowRunSpan = traceView.spans.some((span) => span.name === "workflow.run");
      const hasModelSpan = traceView.spans.some((span) => span.name === "gen_ai.chat.completion");
      const hasAgentArtifacts = traceView.artifacts.some((artifact) => artifact.kind === "ai.response");
      if (hasWorkflowRunSpan && hasModelSpan && hasAgentArtifacts) {
        return traceView;
      }
      await this.sleep(10);
    }
    throw new Error(`Timed out waiting for telemetry for run "${runId}".`);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class TelemetryOutcomeHarness {
  private readonly appConfig = new TelemetryAppConfigFactory().create();

  async run(): Promise<TelemetryOutcomeResult> {
    const container = await new AppContainerFactory().create({
      appConfig: this.appConfig,
      sharedWorkflowWebsocketServer: null,
    });
    const lifecycle = container.resolve(AppContainerLifecycle);

    try {
      await container.resolve(RunEventBusTelemetryReporter).start();
      await container.resolve(Engine).start([...this.appConfig.workflows]);

      const runResult = await this.runWorkflow(container);
      const queryService = container.resolve(TelemetryQueryService);
      const traceView = await new TelemetryEventually(queryService).waitForObservedTelemetry(runResult.runId);
      const runAggregate = await queryService.summarizeRuns({ workflowId: TelemetryWorkflowFixtureFactory.workflowId });
      const aiAggregate = await queryService.summarizeAiUsage({
        workflowId: TelemetryWorkflowFixtureFactory.workflowId,
      });

      return {
        runResult,
        runAggregate,
        aiAggregate,
        traceView,
      };
    } finally {
      await lifecycle.stop();
    }
  }

  private async runWorkflow(
    container: Awaited<ReturnType<AppContainerFactory["create"]>>,
  ): Promise<CompletedRunResult> {
    const runner = container.resolve(CoreTokens.WorkflowRunnerService);
    const result = await runner.runById({
      workflowId: TelemetryWorkflowFixtureFactory.workflowId,
      items: [...TelemetryWorkflowFixtureFactory.createItems()],
    });
    if (result.status !== "completed") {
      const suffix = result.status === "failed" ? `: ${result.error.message}` : ".";
      throw new Error(`Expected completed workflow run, received "${result.status}"${suffix}`);
    }
    return result;
  }
}

describe("telemetry foundation", () => {
  it("records queryable telemetry from a real workflow run with an agent tool round", async () => {
    const outcome = await new TelemetryOutcomeHarness().run();
    const agentNodeSpan = outcome.traceView.spans.find(
      (span) => span.name === "workflow.node" && span.nodeId === "agent_main",
    );

    expect(outcome.runResult.outputs).toEqual([
      {
        json: {
          status: "done",
          classification: "rfq",
          summary: "RFQ qualified and ready for follow-up.",
        },
      },
    ]);
    expect(outcome.runAggregate.totalRuns).toBe(1);
    expect(outcome.runAggregate.completedRuns).toBe(1);
    expect(outcome.runAggregate.failedRuns).toBe(0);
    expect(outcome.runAggregate.runningRuns).toBe(0);
    expect(outcome.runAggregate.averageDurationMs).toBeGreaterThanOrEqual(0);
    expect(outcome.aiAggregate).toEqual({
      inputTokens: 21,
      outputTokens: 9,
      totalTokens: 30,
      cachedInputTokens: 5,
      reasoningTokens: 2,
    });
    expect(outcome.traceView.spans.some((span) => span.name === "workflow.run" && span.status === "completed")).toBe(
      true,
    );
    expect(agentNodeSpan).toMatchObject({
      status: "completed",
      workflowFolder: "telemetry/demo",
      nodeType: "AIAgentNode",
      nodeRole: "workflowNode",
    });
    expect(
      outcome.traceView.spans.some(
        (span) =>
          span.name === "gen_ai.chat.completion" && span.modelName === TelemetryWorkflowFixtureFactory.modelName,
      ),
    ).toBe(true);
    expect(outcome.traceView.spans.some((span) => span.name === "agent.tool.call" && span.status === "completed")).toBe(
      true,
    );
    expect(outcome.traceView.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining(["ai.messages", "ai.response", "tool.input", "tool.output"]),
    );
  });
});
