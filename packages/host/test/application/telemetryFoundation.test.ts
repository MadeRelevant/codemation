import {
  type TelemetryArtifactAttachment,
  CoreTokens,
  type ChatLanguageModel,
  type ChatModelConfig as CoreChatModelConfig,
  chatModel,
  tool,
  type ChatModelConfig,
  type ChatModelFactory,
  type RunResult,
  type Tool,
  type ToolConfig,
  type ToolExecuteArgs,
} from "@codemation/core";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3GenerateResult,
} from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
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
} from "../../src/application/telemetry/TelemetryQueryService";
import type { TelemetryRunTraceViewDto } from "../../src/application/contracts/TelemetryRunTraceContracts";
import { AppContainerFactory } from "../../src/bootstrap/AppContainerFactory";
import { AppContainerLifecycle } from "../../src/bootstrap/AppContainerLifecycle";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

type CompletedRunResult = Extract<RunResult, { status: "completed" }>;

type TelemetryOutcomeResult = Readonly<{
  runResult: CompletedRunResult;
  runAggregate: TelemetryRunAggregate;
  aiAggregate: TelemetryAiAggregate;
  billingAggregate: Readonly<{ currencies: ReadonlyArray<Readonly<{ currency: string; estimatedCostMinor: number }>> }>;
  traceView: TelemetryRunTraceViewDto;
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
  create(args: Readonly<{ config: ChatModelConfig }>): ChatLanguageModel {
    const config = args.config as TelemetryScriptedChatModelConfig;
    let invocationCount = 0;
    const languageModel = new MockLanguageModelV3({
      provider: "openai",
      modelId: config.modelName,
      doGenerate: async (_options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> => {
        const response = config.responses[invocationCount] ?? config.responses[config.responses.length - 1];
        invocationCount += 1;
        return TelemetryResponseConverter.toGenerateResult(response);
      },
    });
    return {
      languageModel,
      modelName: config.modelName,
      provider: "openai",
    };
  }
}

class TelemetryScriptedChatModelConfig implements ChatModelConfig {
  readonly type = TelemetryScriptedChatModelFactory as CoreChatModelConfig["type"];
  readonly provider = "openai";
  readonly modelName: string;

  constructor(
    public readonly name: string,
    public readonly responses: ReadonlyArray<unknown>,
  ) {
    this.modelName = name;
  }
}

class TelemetryResponseConverter {
  static toGenerateResult(response: unknown): LanguageModelV3GenerateResult {
    const payload = (response ?? {}) as Readonly<{
      content?: string;
      tool_calls?: ReadonlyArray<{ id?: string; name: string; args: unknown }>;
      usage_metadata?: Readonly<{
        input_tokens?: number;
        output_tokens?: number;
        input_token_details?: { cached_tokens?: number };
        output_token_details?: { reasoning_tokens?: number };
      }>;
    }>;
    const content: LanguageModelV3Content[] = [];
    if (typeof payload.content === "string" && payload.content.length > 0) {
      content.push({ type: "text", text: payload.content });
    }
    for (const call of payload.tool_calls ?? []) {
      content.push({
        type: "tool-call",
        toolCallId: call.id ?? `tool-call-${content.length}`,
        toolName: call.name,
        input: JSON.stringify(call.args ?? {}),
      });
    }
    const finishReason: LanguageModelV3GenerateResult["finishReason"] =
      (payload.tool_calls?.length ?? 0) > 0
        ? { unified: "tool-calls", raw: "tool-calls" }
        : { unified: "stop", raw: "stop" };
    const usage: LanguageModelV3GenerateResult["usage"] = {
      inputTokens: {
        total: payload.usage_metadata?.input_tokens,
        noCache: undefined,
        cacheRead: payload.usage_metadata?.input_token_details?.cached_tokens,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: payload.usage_metadata?.output_tokens,
        text: payload.usage_metadata?.output_tokens,
        reasoning: payload.usage_metadata?.output_token_details?.reasoning_tokens,
      },
    };
    return { content, finishReason, usage, warnings: [] };
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

  async waitForObservedTelemetry(runId: string): Promise<TelemetryRunTraceViewDto> {
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
      const costAggregate = await queryService.summarizeCosts({
        workflowId: TelemetryWorkflowFixtureFactory.workflowId,
      });

      return {
        runResult,
        runAggregate,
        aiAggregate,
        billingAggregate: costAggregate,
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
    expect(outcome.billingAggregate).toMatchObject({
      currencies: [{ currency: "USD", estimatedCostMinor: 39_000 }],
    });
    expect(outcome.traceView.metricPoints.some((point) => point.metricName === "codemation.cost.estimated")).toBe(true);
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
    expect(outcome.traceView.metricPoints.some((point) => point.metricName === "gen_ai.usage.total_tokens")).toBe(true);
  });
});
