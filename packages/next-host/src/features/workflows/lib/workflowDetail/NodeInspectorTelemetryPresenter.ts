import type {
  ConnectionInvocationRecord,
  NodeExecutionSnapshot,
  TelemetryRunTraceViewDto,
} from "../../hooks/realtime/realtime";

import { FocusedInvocationModelFactory } from "./FocusedInvocationModelFactory";
import type { WorkflowDiagramNode } from "./workflowDetailTypes";

export type NodeInspectorPillModel = Readonly<{
  label: string;
  value: string;
}>;

export type NodeInspectorKeyValueModel = Readonly<{
  label: string;
  value: string;
}>;

export type NodeInspectorJsonBlockModel = Readonly<{
  label: string;
  value: unknown;
}>;

export type NodeInspectorTableModel = Readonly<{
  columns: ReadonlyArray<string>;
  rows: ReadonlyArray<Readonly<Record<string, string>>>;
}>;

export type NodeInspectorTimelineEntryModel = Readonly<{
  key: string;
  title: string;
  subtitle?: string;
  kind: "agent" | "tool";
  pills?: ReadonlyArray<NodeInspectorPillModel>;
  jsonBlocks?: ReadonlyArray<NodeInspectorJsonBlockModel>;
  /**
   * Tool calls produced by an LLM round are rendered as children under their parent model entry
   * so the right-side panel mirrors the nested structure already used by the execution-tree
   * inspector (one row per tool call, grouped under the LLM turn that emitted them).
   */
  children?: ReadonlyArray<NodeInspectorTimelineEntryModel>;
}>;

export type NodeInspectorBreadcrumbModel = Readonly<{
  /** Already concatenated, ready to render — e.g. "Item 2 of 3" in focused-item mode. */
  text: string;
}>;

export type NodeInspectorSectionNavigationModel = Readonly<{
  prev: Readonly<{ invocationId: string }> | null;
  next: Readonly<{ invocationId: string }> | null;
  /** The invocation currently in focus. Lets the renderer wire a "clear focus" affordance. */
  focusedInvocationId: string;
}>;

export type NodeInspectorSectionModel = Readonly<{
  id: string;
  title: string;
  description?: string;
  pills?: ReadonlyArray<NodeInspectorPillModel>;
  keyValues?: ReadonlyArray<NodeInspectorKeyValueModel>;
  table?: NodeInspectorTableModel;
  jsonBlocks?: ReadonlyArray<NodeInspectorJsonBlockModel>;
  timeline?: ReadonlyArray<NodeInspectorTimelineEntryModel>;
  emptyLabel?: string;
  breadcrumb?: NodeInspectorBreadcrumbModel;
  navigation?: NodeInspectorSectionNavigationModel;
}>;

export type NodeInspectorTelemetryModel = Readonly<{
  sections: ReadonlyArray<NodeInspectorSectionModel>;
}>;

type TelemetrySpan = TelemetryRunTraceViewDto["spans"][number];
type TelemetryMetricPoint = TelemetryRunTraceViewDto["metricPoints"][number];

const InspectorTelemetryMetricNames = {
  agentTurns: "codemation.ai.turns",
  agentToolCalls: "codemation.ai.tool_calls",
  billingEstimatedCost: "codemation.cost.estimated",
  gmailMessagesEmitted: "codemation.gmail.messages_emitted",
  gmailAttachments: "codemation.gmail.attachments",
  gmailAttachmentBytes: "codemation.gmail.attachment_bytes",
} as const;

const InspectorGenAiAttributeNames = {
  usageInputTokens: "gen_ai.usage.input_tokens",
  usageOutputTokens: "gen_ai.usage.output_tokens",
  usageTotalTokens: "gen_ai.usage.total_tokens",
  usageCacheReadInputTokens: "gen_ai.usage.cache_read.input_tokens",
  usageReasoningTokens: "codemation.gen_ai.usage.reasoning_tokens",
} as const;

const InspectorCostAttributeNames = {
  currency: "cost.currency",
  currencyScale: "cost.currency_scale",
} as const;

export class NodeInspectorTelemetryPresenter {
  static create(
    args: Readonly<{
      node: WorkflowDiagramNode;
      nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
      connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
      traceView?: TelemetryRunTraceViewDto;
      focusedInvocationId?: string | null;
    }>,
  ): NodeInspectorTelemetryModel {
    const sections: NodeInspectorSectionModel[] = [
      this.createOverviewSection(args.node, args.nodeSnapshotsByNodeId, args.connectionInvocations, args.traceView),
    ];
    if (this.isAiAgentNode(args.node)) {
      sections.push(
        this.createAgentTimelineSection(
          args.node,
          args.connectionInvocations,
          args.traceView,
          args.focusedInvocationId ?? null,
        ),
      );
    } else if (this.isLanguageModelNode(args.node)) {
      sections.push(this.createLanguageModelMetricsSection(args.node, args.connectionInvocations, args.traceView));
      sections.push(
        this.createLanguageModelTimelineSection(
          args.node,
          args.connectionInvocations,
          args.traceView,
          args.focusedInvocationId ?? null,
        ),
      );
    } else if (this.isToolNode(args.node)) {
      sections.push(this.createToolMetricsSection(args.node, args.connectionInvocations));
      sections.push(
        this.createToolTimelineSection(
          args.node,
          args.connectionInvocations,
          args.traceView,
          args.focusedInvocationId ?? null,
        ),
      );
    } else if (this.isGmailTriggerNode(args.node)) {
      sections.push(this.createGmailMetricsSection(args.node, args.traceView));
      sections.push(this.createGmailMessagesSection(args.node, args.traceView));
    }
    return {
      sections: sections.filter((section) => this.sectionHasContent(section)),
    };
  }

  private static createOverviewSection(
    node: WorkflowDiagramNode,
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): NodeInspectorSectionModel {
    const snapshot = nodeSnapshotsByNodeId[node.id];
    const latestInvocation = this.getLatestConnectionInvocation(node, connectionInvocations);
    const status = snapshot?.status ?? latestInvocation?.status ?? "idle";
    const startedAt =
      snapshot?.startedAt ?? latestInvocation?.startedAt ?? snapshot?.queuedAt ?? latestInvocation?.queuedAt;
    const finishedAt = snapshot?.finishedAt ?? latestInvocation?.finishedAt;
    return {
      id: "overview",
      title: "Overview",
      pills: [
        { label: "Status", value: status },
        ...(startedAt && finishedAt ? [{ label: "Duration", value: this.formatDuration(startedAt, finishedAt) }] : []),
        ...(node.role ? [{ label: "Role", value: node.role }] : []),
      ],
      keyValues: [
        { label: "Kind", value: node.kind },
        { label: "Type", value: node.type },
        { label: "Retry", value: node.retryPolicySummary ?? "None" },
        { label: "Node error handler", value: node.hasNodeErrorHandler ? "Configured" : "Not configured" },
        ...(node.parentNodeId ? [{ label: "Parent node", value: node.parentNodeId }] : []),
        ...this.createOverviewTelemetryKeyValues(node, connectionInvocations, traceView),
      ],
    };
  }

  private static createOverviewTelemetryKeyValues(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): ReadonlyArray<NodeInspectorKeyValueModel> {
    if (this.isAiAgentNode(node)) {
      const metricPoints = this.getMetricPointsForNode(node, traceView);
      if (metricPoints.length === 0) {
        return [];
      }
      return [
        { label: "Input tokens", value: this.sumMetrics(metricPoints, InspectorGenAiAttributeNames.usageInputTokens) },
        {
          label: "Output tokens",
          value: this.sumMetrics(metricPoints, InspectorGenAiAttributeNames.usageOutputTokens),
        },
        {
          label: "Cached tokens",
          value: this.sumMetrics(metricPoints, InspectorGenAiAttributeNames.usageCacheReadInputTokens),
        },
        {
          label: "Reasoning tokens",
          value: this.sumMetrics(metricPoints, InspectorGenAiAttributeNames.usageReasoningTokens),
        },
        ...this.createCostKeyValues(metricPoints),
      ];
    }
    if (this.isLanguageModelNode(node)) {
      const spanIds = this.getConnectionSpanIds(node, connectionInvocations, traceView, "gen_ai.chat.completion");
      const metricPoints = (traceView?.metricPoints ?? []).filter((point) => spanIds.has(point.spanId ?? ""));
      if (metricPoints.length === 0) {
        return [];
      }
      return [
        { label: "Input tokens", value: this.sumMetrics(metricPoints, InspectorGenAiAttributeNames.usageInputTokens) },
        {
          label: "Output tokens",
          value: this.sumMetrics(metricPoints, InspectorGenAiAttributeNames.usageOutputTokens),
        },
        { label: "Total tokens", value: this.sumMetrics(metricPoints, InspectorGenAiAttributeNames.usageTotalTokens) },
        ...this.createCostKeyValues(metricPoints),
      ];
    }
    return [];
  }

  private static createAgentTimelineSection(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
    traceView: TelemetryRunTraceViewDto | undefined,
    focusedInvocationId: string | null,
  ): NodeInspectorSectionModel {
    const metricPoints = this.getMetricPointsForNode(node, traceView);
    const agentSpans = this.getSpansForNode(node, traceView);
    const llmSpans = agentSpans
      .filter((span) => span.name === "gen_ai.chat.completion")
      .sort((left, right) => this.compareIso(left.startTime, right.startTime));
    const toolSpans = agentSpans
      .filter((span) => span.name === "agent.tool.call")
      .sort((left, right) => this.compareIso(left.startTime, right.startTime));
    const base = {
      id: "agent-timeline",
      title: "Conversation and tool timeline",
      pills: [
        { label: "Turns", value: this.sumMetrics(metricPoints, InspectorTelemetryMetricNames.agentTurns) },
        { label: "Tool calls", value: this.sumMetrics(metricPoints, InspectorTelemetryMetricNames.agentToolCalls) },
        ...this.createCostPills(metricPoints),
        {
          label: "Models",
          value: this.joinUnique(
            llmSpans
              .map((span) => span.modelName)
              .filter((value): value is string => typeof value === "string" && value.length > 0),
          ),
        },
      ],
      emptyLabel: "Run this agent to inspect model turns and tool calls.",
    };
    const itemEntries = this.buildAgentTimelineByItem(llmSpans, toolSpans, traceView);
    const focused = focusedInvocationId
      ? this.buildFocusedAgentTimelineSection({
          base,
          itemEntries,
          agentNodeId: node.id,
          connectionInvocations,
          focusedInvocationId,
        })
      : undefined;
    if (focused) return focused;
    return {
      ...base,
      timeline: itemEntries,
    };
  }

  /**
   * Resolves the agent timeline payload for "focused item" mode.
   *
   * The user clicks a single invocation in the bottom execution tree; we look up the
   * `iterationId` of that invocation among the agent's child connection invocations and surface
   * only the matching Item N subtree. Prev/next navigates between items the same way the LLM and
   * tool sections do.
   */
  private static buildFocusedAgentTimelineSection(
    args: Readonly<{
      base: Pick<NodeInspectorSectionModel, "id" | "title" | "emptyLabel" | "pills">;
      itemEntries: ReadonlyArray<NodeInspectorTimelineEntryModel>;
      agentNodeId: string;
      connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
      focusedInvocationId: string;
    }>,
  ): NodeInspectorSectionModel | undefined {
    if (args.itemEntries.length === 0) return undefined;
    const childInvocations = args.connectionInvocations.filter((inv) => inv.parentAgentNodeId === args.agentNodeId);
    const nav = FocusedInvocationModelFactory.create({
      nodeInvocations: childInvocations,
      focusedInvocationId: args.focusedInvocationId,
    });
    if (!nav) return undefined;
    const focusedEntry = args.itemEntries.find((entry) => entry.key === nav.itemBucketKey);
    if (!focusedEntry) return undefined;
    return {
      ...args.base,
      timeline: [focusedEntry],
      breadcrumb: { text: `Item ${String(nav.itemNumber)} of ${String(nav.totalItems)}` },
      navigation:
        nav.totalItems > 1
          ? {
              prev: nav.prevItemFirstInvocationId ? { invocationId: nav.prevItemFirstInvocationId } : null,
              next: nav.nextItemFirstInvocationId ? { invocationId: nav.nextItemFirstInvocationId } : null,
              focusedInvocationId: args.focusedInvocationId,
            }
          : undefined,
    };
  }

  /**
   * Groups the agent's LLM and tool spans by `iterationId` (per-item identity stamped onto the
   * underlying telemetry by the engine) and returns one parent "Item N" entry per item.
   *
   * Each Item N entry's children are LLM round entries with their tool calls already nested under
   * them via {@link buildAgentTimelineEntriesForItem} (parent-span chain walk). When fewer than
   * two distinct iteration ids are present (single-item agents, legacy traces without iteration
   * ids) we fall back to the original flat layout so nothing regresses.
   */
  private static buildAgentTimelineByItem(
    llmSpans: ReadonlyArray<TelemetrySpan>,
    toolSpans: ReadonlyArray<TelemetrySpan>,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): ReadonlyArray<NodeInspectorTimelineEntryModel> {
    const grouped = this.partitionAgentSpansByIteration(llmSpans, toolSpans);
    if (grouped.length < 2) {
      return this.buildAgentTimelineEntries(llmSpans, toolSpans, traceView);
    }
    const iterationCostPoints = this.collectIterationCostPoints(traceView);
    return grouped.map((bucket, index) => {
      const children = this.buildAgentTimelineEntries(bucket.llmSpans, bucket.toolSpans, traceView);
      const itemNumber = bucket.itemIndex !== undefined ? bucket.itemIndex + 1 : index + 1;
      const costPills = bucket.iterationId
        ? this.createCostPills(iterationCostPoints.get(bucket.iterationId) ?? [])
        : [];
      const childCount = bucket.llmSpans.length + bucket.toolSpans.length;
      return {
        key: bucket.iterationId ?? `agent-item-${String(index)}`,
        kind: "agent" as const,
        title: `Item ${String(itemNumber)}`,
        pills: [
          { label: "Turns", value: String(bucket.llmSpans.length) },
          { label: "Tool calls", value: String(bucket.toolSpans.length) },
          ...costPills,
          ...(childCount === 0 ? [] : []),
        ],
        children,
      } satisfies NodeInspectorTimelineEntryModel;
    });
  }

  private static partitionAgentSpansByIteration(
    llmSpans: ReadonlyArray<TelemetrySpan>,
    toolSpans: ReadonlyArray<TelemetrySpan>,
  ): ReadonlyArray<
    Readonly<{
      iterationId: string | undefined;
      itemIndex: number | undefined;
      llmSpans: TelemetrySpan[];
      toolSpans: TelemetrySpan[];
    }>
  > {
    type Bucket = {
      iterationId: string | undefined;
      itemIndex: number | undefined;
      llmSpans: TelemetrySpan[];
      toolSpans: TelemetrySpan[];
      earliestStart: string;
    };
    const buckets = new Map<string, Bucket>();
    const fallbackKey = "__no_iteration__";
    const accumulate = (spans: ReadonlyArray<TelemetrySpan>, kind: "llm" | "tool"): void => {
      for (const span of spans) {
        const iterationId = span.iterationId;
        const key = iterationId && iterationId.length > 0 ? iterationId : fallbackKey;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            iterationId: iterationId && iterationId.length > 0 ? iterationId : undefined,
            itemIndex: typeof span.itemIndex === "number" ? span.itemIndex : undefined,
            llmSpans: [],
            toolSpans: [],
            earliestStart: span.startTime ?? "",
          };
          buckets.set(key, bucket);
        }
        if (typeof span.itemIndex === "number" && bucket.itemIndex === undefined) {
          bucket.itemIndex = span.itemIndex;
        }
        if (span.startTime && (bucket.earliestStart === "" || span.startTime < bucket.earliestStart)) {
          bucket.earliestStart = span.startTime;
        }
        if (kind === "llm") {
          bucket.llmSpans.push(span);
        } else {
          bucket.toolSpans.push(span);
        }
      }
    };
    accumulate(llmSpans, "llm");
    accumulate(toolSpans, "tool");
    if (buckets.size === 1 && buckets.has(fallbackKey)) {
      return [];
    }
    buckets.delete(fallbackKey);
    return [...buckets.values()].sort((left, right) => {
      if (left.itemIndex !== right.itemIndex) {
        if (left.itemIndex === undefined) return 1;
        if (right.itemIndex === undefined) return -1;
        return left.itemIndex - right.itemIndex;
      }
      return left.earliestStart.localeCompare(right.earliestStart);
    });
  }

  /**
   * Groups tool-call spans under the LLM round that produced them by walking `parentSpanId`.
   *
   * Each tool-call span's parent chain is walked upward; the first ancestor that matches one of
   * the agent's LLM spans owns the tool call. This is robust under parallelism — temporal grouping
   * (the previous heuristic) misattributed tool calls when items processed concurrently.
   *
   * Tool spans whose parent chain doesn't reach any of the agent's LLM spans surface as top-level
   * entries so nothing is silently dropped.
   */
  private static buildAgentTimelineEntries(
    llmSpans: ReadonlyArray<TelemetrySpan>,
    toolSpans: ReadonlyArray<TelemetrySpan>,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): ReadonlyArray<NodeInspectorTimelineEntryModel> {
    if (llmSpans.length === 0) {
      return toolSpans.map((span) => this.createTimelineEntry(span, traceView));
    }
    const spansById = new Map<string, TelemetrySpan>();
    for (const span of traceView?.spans ?? []) {
      spansById.set(span.spanId, span);
    }
    const llmSpanIds = new Set(llmSpans.map((span) => span.spanId));
    const childrenByLlmSpanId = new Map<string, TelemetrySpan[]>();
    const orphanToolSpans: TelemetrySpan[] = [];
    for (const toolSpan of toolSpans) {
      const ancestorLlmSpanId = this.findAncestorSpanId(toolSpan, spansById, llmSpanIds);
      if (ancestorLlmSpanId) {
        const existing = childrenByLlmSpanId.get(ancestorLlmSpanId);
        if (existing) {
          existing.push(toolSpan);
        } else {
          childrenByLlmSpanId.set(ancestorLlmSpanId, [toolSpan]);
        }
      } else {
        orphanToolSpans.push(toolSpan);
      }
    }
    const llmEntries = llmSpans.map((llmSpan) => {
      const baseEntry = this.createTimelineEntry(llmSpan, traceView);
      const startTime = llmSpan.startTime ?? "";
      const children = (childrenByLlmSpanId.get(llmSpan.spanId) ?? []).map((toolSpan) =>
        this.createTimelineEntry(toolSpan, traceView),
      );
      if (children.length === 0) return { entry: baseEntry, startTime };
      return { entry: { ...baseEntry, children }, startTime };
    });
    const orphanToolEntries = orphanToolSpans.map((toolSpan) => ({
      entry: this.createTimelineEntry(toolSpan, traceView),
      startTime: toolSpan.startTime ?? "",
    }));
    // Interleave LLM rounds and orphan tool calls in chronological order so the timeline reads
    // top-to-bottom the way the agent actually executed (e.g. "request → tool calls → response")
    // even when telemetry didn't link tool spans to a parent LLM via `parentSpanId`.
    return [...llmEntries, ...orphanToolEntries]
      .sort((left, right) => left.startTime.localeCompare(right.startTime))
      .map((wrapped) => wrapped.entry);
  }

  private static findAncestorSpanId(
    span: TelemetrySpan,
    spansById: ReadonlyMap<string, TelemetrySpan>,
    targetSpanIds: ReadonlySet<string>,
  ): string | undefined {
    let cursor: TelemetrySpan | undefined = span;
    const visited = new Set<string>();
    while (cursor) {
      if (visited.has(cursor.spanId)) return undefined;
      visited.add(cursor.spanId);
      const parentSpanId = cursor.parentSpanId;
      if (typeof parentSpanId !== "string" || parentSpanId.length === 0) return undefined;
      if (targetSpanIds.has(parentSpanId)) return parentSpanId;
      cursor = spansById.get(parentSpanId);
    }
    return undefined;
  }

  private static createLanguageModelMetricsSection(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): NodeInspectorSectionModel {
    const spanIds = this.getConnectionSpanIds(node, connectionInvocations, traceView, "gen_ai.chat.completion");
    const spans = (traceView?.spans ?? []).filter((span) => spanIds.has(span.spanId));
    return {
      id: "language-model-metrics",
      title: "Chat model metrics",
      pills: [
        { label: "Invocations", value: String(spanIds.size) },
        ...this.createCostPills((traceView?.metricPoints ?? []).filter((point) => spanIds.has(point.spanId ?? ""))),
        {
          label: "Model",
          value: this.joinUnique(
            spans
              .map((span) => span.modelName)
              .filter((value): value is string => typeof value === "string" && value.length > 0),
          ),
        },
      ],
    };
  }

  private static createLanguageModelTimelineSection(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
    traceView: TelemetryRunTraceViewDto | undefined,
    focusedInvocationId: string | null,
  ): NodeInspectorSectionModel {
    const invocations = connectionInvocations.filter((inv) => inv.connectionNodeId === node.id);
    const spansByInvocationId = this.buildSpansByInvocationId(traceView, "gen_ai.chat.completion");
    const base = {
      id: "language-model-timeline",
      title: "Model responses",
      emptyLabel: "No model invocations captured for this run yet.",
    };
    const focused = focusedInvocationId
      ? this.buildFocusedItemSection({
          base,
          invocations,
          spansByInvocationId,
          traceView,
          focusedInvocationId,
          childCountPillLabel: "Rounds",
        })
      : undefined;
    if (focused) {
      return focused;
    }
    return {
      ...base,
      timeline: this.buildInvocationItemEntries({
        invocations,
        spansByInvocationId,
        traceView,
        childCountPillLabel: "Rounds",
      }),
    };
  }

  private static createToolMetricsSection(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
  ): NodeInspectorSectionModel {
    const invocations = connectionInvocations.filter((invocation) => invocation.connectionNodeId === node.id);
    return {
      id: "tool-metrics",
      title: "Tool activity",
      pills: [
        { label: "Invocations", value: String(invocations.length) },
        {
          label: "Completed",
          value: String(invocations.filter((invocation) => invocation.status === "completed").length),
        },
        { label: "Failed", value: String(invocations.filter((invocation) => invocation.status === "failed").length) },
        {
          label: "Repair loops",
          value: String(
            invocations.filter(
              (invocation) =>
                invocation.error &&
                typeof invocation.error === "object" &&
                invocation.error.details &&
                typeof invocation.error.details === "object" &&
                invocation.error.details !== null &&
                "repair" in invocation.error.details,
            ).length,
          ),
        },
      ],
    };
  }

  private static createToolTimelineSection(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
    traceView: TelemetryRunTraceViewDto | undefined,
    focusedInvocationId: string | null,
  ): NodeInspectorSectionModel {
    const invocations = connectionInvocations.filter((inv) => inv.connectionNodeId === node.id);
    const invocationIdSet = new Set(invocations.map((inv) => inv.invocationId));
    // Global set to exclude spans that are claimed by other nodes' invocations
    const allInvocationIds = new Set(connectionInvocations.map((inv) => inv.invocationId));
    const spansByInvocationId = this.buildSpansByInvocationId(traceView, "agent.tool.call");
    const base = {
      id: "tool-timeline",
      title: "Tool inputs and outputs",
      emptyLabel: "No tool calls captured for this run yet.",
    };
    const focused = focusedInvocationId
      ? this.buildFocusedItemSection({
          base,
          invocations,
          spansByInvocationId,
          traceView,
          focusedInvocationId,
          childCountPillLabel: "Calls",
        })
      : undefined;
    if (focused) {
      return focused;
    }
    // Spans with a connectionInvocationId that doesn't appear in any known invocation: these are
    // telemetry records that arrived before (or without) their corresponding invocation persistence.
    // They appear at the bottom of the timeline so nothing is silently dropped.
    const spanOnlyEntries = (traceView?.spans ?? [])
      .filter(
        (span) =>
          span.name === "agent.tool.call" &&
          typeof span.connectionInvocationId === "string" &&
          !invocationIdSet.has(span.connectionInvocationId) &&
          !allInvocationIds.has(span.connectionInvocationId),
      )
      .sort((left, right) => this.compareIso(left.startTime, right.startTime))
      .map((span) => this.createTimelineEntry(span, traceView));
    return {
      ...base,
      timeline: [
        ...this.buildInvocationItemEntries({
          invocations,
          spansByInvocationId,
          traceView,
          childCountPillLabel: "Calls",
        }),
        ...spanOnlyEntries,
      ],
    };
  }

  private static createGmailMetricsSection(
    node: WorkflowDiagramNode,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): NodeInspectorSectionModel {
    const metricPoints = this.getMetricPointsForNode(node, traceView);
    return {
      id: "gmail-metrics",
      title: "Gmail metrics",
      pills: [
        {
          label: "Messages emitted",
          value: this.sumMetrics(metricPoints, InspectorTelemetryMetricNames.gmailMessagesEmitted),
        },
        { label: "Attachments", value: this.sumMetrics(metricPoints, InspectorTelemetryMetricNames.gmailAttachments) },
        {
          label: "Attachment bytes",
          value: this.sumMetrics(metricPoints, InspectorTelemetryMetricNames.gmailAttachmentBytes),
        },
      ],
    };
  }

  private static createGmailMessagesSection(
    node: WorkflowDiagramNode,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): NodeInspectorSectionModel {
    const artifact = (traceView?.artifacts ?? [])
      .filter((candidate) => candidate.nodeId === node.id && candidate.kind === "gmail.messages")
      .sort((left, right) => this.compareIso(right.createdAt, left.createdAt))[0];
    const rows = this.toMessageTableRows(artifact?.previewJson);
    return {
      id: "gmail-messages",
      title: "Latest Gmail messages",
      table:
        rows.length > 0
          ? {
              columns: ["messageId", "subject", "from", "attachmentCount", "attachmentBytes"],
              rows,
            }
          : undefined,
      emptyLabel: "No Gmail message preview captured for this run yet.",
    };
  }

  private static createTimelineEntry(
    span: TelemetrySpan,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): NodeInspectorTimelineEntryModel {
    const artifacts = (traceView?.artifacts ?? []).filter((artifact) => artifact.spanId === span.spanId);
    return {
      key: span.spanId,
      kind: span.name === "gen_ai.chat.completion" ? "agent" : "tool",
      title:
        span.name === "gen_ai.chat.completion"
          ? `Model call${span.modelName ? ` · ${span.modelName}` : ""}`
          : this.getToolTitle(span),
      subtitle: this.buildSpanSubtitle(span),
      pills: [
        { label: "Status", value: span.status ?? "unknown" },
        ...(span.startTime && span.endTime
          ? [{ label: "Duration", value: this.formatDuration(span.startTime, span.endTime) }]
          : []),
      ],
      jsonBlocks: artifacts.map((artifact) => ({
        label: artifact.kind,
        value: artifact.previewJson ?? artifact.payloadJson ?? artifact.previewText ?? artifact.payloadText ?? null,
      })),
    };
  }

  private static getToolTitle(span: TelemetrySpan): string {
    const toolName = span.attributes?.["codemation.tool.name"];
    return typeof toolName === "string" && toolName.length > 0 ? `Tool call · ${toolName}` : "Tool call";
  }

  private static buildSpanSubtitle(span: TelemetrySpan): string | undefined {
    return span.startTime ? this.formatWhen(span.startTime) : undefined;
  }

  private static createConnectionInvocationTimelineEntry(
    invocation: ConnectionInvocationRecord,
  ): NodeInspectorTimelineEntryModel {
    return {
      key: invocation.invocationId,
      kind: "tool",
      title: "Tool call",
      subtitle: [this.formatWhen(invocation.updatedAt), `Invocation ${invocation.invocationId}`].join(" · "),
      pills: [
        { label: "Status", value: invocation.status },
        ...(invocation.startedAt && invocation.finishedAt
          ? [{ label: "Duration", value: this.formatDuration(invocation.startedAt, invocation.finishedAt) }]
          : []),
      ],
      jsonBlocks: [
        ...(invocation.managedInput !== undefined ? [{ label: "tool.input", value: invocation.managedInput }] : []),
        ...(invocation.managedOutput !== undefined ? [{ label: "tool.output", value: invocation.managedOutput }] : []),
        ...(invocation.error !== undefined ? [{ label: "tool.error", value: invocation.error }] : []),
      ],
    };
  }

  private static getMetricPointsForNode(
    node: WorkflowDiagramNode,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): ReadonlyArray<TelemetryMetricPoint> {
    return (traceView?.metricPoints ?? []).filter((point) => point.nodeId === node.id);
  }

  private static getSpansForNode(
    node: WorkflowDiagramNode,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): ReadonlyArray<TelemetrySpan> {
    return (traceView?.spans ?? []).filter((span) => span.nodeId === node.id);
  }

  /**
   * Groups `invocations` by `iterationId` (the per-item identity minted by the engine inside
   * `NodeExecutor.executeRunnableActivation`), sorts groups by `itemIndex` first, then by earliest
   * invocation start, and returns one parent "Item N" entry per group whose `children` are the
   * leaf timeline entries.
   *
   * Falls back to grouping by `parentAgentActivationId` for runs persisted before iteration ids
   * existed, so the presenter never regresses on legacy data. Invocations missing both fields land
   * in a shared "unscoped" bucket and surface as a final unindexed group.
   */
  private static buildInvocationItemEntries(
    args: Readonly<{
      invocations: ReadonlyArray<ConnectionInvocationRecord>;
      spansByInvocationId: ReadonlyMap<string, TelemetrySpan>;
      traceView: TelemetryRunTraceViewDto | undefined;
      childCountPillLabel: "Rounds" | "Calls";
    }>,
  ): ReadonlyArray<NodeInspectorTimelineEntryModel> {
    const unscopedBucketKey = "__unscoped__";
    const groups = new Map<string, ConnectionInvocationRecord[]>();
    for (const invocation of args.invocations) {
      const bucketKey = this.iterationBucketKey(invocation, unscopedBucketKey);
      const existing = groups.get(bucketKey);
      if (existing) {
        existing.push(invocation);
      } else {
        groups.set(bucketKey, [invocation]);
      }
    }
    if (groups.size === 0) {
      return [];
    }
    const getInvocationTime = (inv: ConnectionInvocationRecord): string =>
      inv.startedAt ?? inv.queuedAt ?? inv.updatedAt;
    const earliestStart = (group: ReadonlyArray<ConnectionInvocationRecord>): string =>
      [...group].map(getInvocationTime).sort((a, b) => this.compareIso(a, b))[0] ?? "";
    const groupItemIndex = (group: ReadonlyArray<ConnectionInvocationRecord>): number | undefined => {
      for (const inv of group) {
        if (typeof inv.itemIndex === "number") return inv.itemIndex;
      }
      return undefined;
    };
    const sortedGroups = [...groups.entries()].sort(([, leftInvocations], [, rightInvocations]) => {
      const leftIndex = groupItemIndex(leftInvocations);
      const rightIndex = groupItemIndex(rightInvocations);
      if (leftIndex !== rightIndex) {
        if (leftIndex === undefined) return 1;
        if (rightIndex === undefined) return -1;
        return leftIndex - rightIndex;
      }
      return this.compareIso(earliestStart(leftInvocations), earliestStart(rightInvocations));
    });
    const iterationCostPoints = this.collectIterationCostPoints(args.traceView);
    return sortedGroups.map(([bucketKey, groupInvocations], groupIndex) => {
      const sortedInvocations = [...groupInvocations].sort((left, right) =>
        this.compareIso(getInvocationTime(left), getInvocationTime(right)),
      );
      const children = sortedInvocations.map((invocation) => {
        const span = args.spansByInvocationId.get(invocation.invocationId);
        return span
          ? this.createTimelineEntry(span, args.traceView)
          : this.createConnectionInvocationTimelineEntry(invocation);
      });
      const stableKey = bucketKey !== unscopedBucketKey ? bucketKey : `unscoped-${String(groupIndex)}`;
      const itemIndex = groupItemIndex(groupInvocations);
      const itemNumber = typeof itemIndex === "number" ? itemIndex + 1 : groupIndex + 1;
      const iterationId = bucketKey !== unscopedBucketKey && !bucketKey.startsWith("legacy::") ? bucketKey : undefined;
      const costPills = iterationId ? this.createCostPills(iterationCostPoints.get(iterationId) ?? []) : [];
      return {
        key: stableKey,
        kind: "agent" as const,
        title: `Item ${String(itemNumber)}`,
        pills: [{ label: args.childCountPillLabel, value: String(groupInvocations.length) }, ...costPills],
        children,
      };
    });
  }

  /**
   * Resolves the section payload for the inspector's "focused item" mode.
   *
   * The user selects an invocation in the bottom execution tree, but the inspector renders the
   * entire **item** (per-trigger iteration) it belongs to as a single subtree — exactly the same
   * `Item N` accordion entry that the all-items view produces, including children, cost pills, and
   * the round/call count pill. Prev/next navigates between **items** (not individual invocations);
   * when the node only has one item the navigation is omitted entirely so the chevrons disappear.
   *
   * Returns `undefined` when the focused id does not belong to any of `invocations` so the caller
   * falls back to the all-items grouped accordion.
   */
  private static buildFocusedItemSection(
    args: Readonly<{
      base: Pick<NodeInspectorSectionModel, "id" | "title" | "emptyLabel">;
      invocations: ReadonlyArray<ConnectionInvocationRecord>;
      spansByInvocationId: ReadonlyMap<string, TelemetrySpan>;
      traceView: TelemetryRunTraceViewDto | undefined;
      focusedInvocationId: string;
      childCountPillLabel: "Rounds" | "Calls";
    }>,
  ): NodeInspectorSectionModel | undefined {
    const nav = FocusedInvocationModelFactory.create({
      nodeInvocations: args.invocations,
      focusedInvocationId: args.focusedInvocationId,
    });
    if (!nav) {
      return undefined;
    }
    const itemEntries = this.buildInvocationItemEntries({
      invocations: nav.itemInvocations,
      spansByInvocationId: args.spansByInvocationId,
      traceView: args.traceView,
      childCountPillLabel: args.childCountPillLabel,
    });
    return {
      ...args.base,
      timeline: itemEntries,
      breadcrumb: {
        text: `Item ${String(nav.itemNumber)} of ${String(nav.totalItems)}`,
      },
      navigation:
        nav.totalItems > 1
          ? {
              prev: nav.prevItemFirstInvocationId ? { invocationId: nav.prevItemFirstInvocationId } : null,
              next: nav.nextItemFirstInvocationId ? { invocationId: nav.nextItemFirstInvocationId } : null,
              focusedInvocationId: args.focusedInvocationId,
            }
          : undefined,
    };
  }

  /**
   * Indexes cost metric points (`codemation.cost.estimated`) by `iterationId` so each Item N
   * accordion can show the cost without a second pass over the trace view.
   */
  private static collectIterationCostPoints(
    traceView: TelemetryRunTraceViewDto | undefined,
  ): ReadonlyMap<string, ReadonlyArray<TelemetryMetricPoint>> {
    const result = new Map<string, TelemetryMetricPoint[]>();
    for (const point of traceView?.metricPoints ?? []) {
      if (point.metricName !== InspectorTelemetryMetricNames.billingEstimatedCost) {
        continue;
      }
      const iterationId = point.iterationId;
      if (!iterationId || iterationId.length === 0) {
        continue;
      }
      const bucket = result.get(iterationId);
      if (bucket) {
        bucket.push(point);
      } else {
        result.set(iterationId, [point]);
      }
    }
    return result;
  }

  private static iterationBucketKey(invocation: ConnectionInvocationRecord, unscopedKey: string): string {
    if (typeof invocation.iterationId === "string" && invocation.iterationId.length > 0) {
      return invocation.iterationId;
    }
    if (typeof invocation.parentAgentActivationId === "string" && invocation.parentAgentActivationId.length > 0) {
      return `legacy::${invocation.parentAgentActivationId}::${invocation.itemIndex ?? 0}`;
    }
    return unscopedKey;
  }

  /**
   * Builds a `Map<connectionInvocationId, TelemetrySpan>` for spans of the given `spanName`
   * so callers can resolve a span for a given invocation in O(1).
   */
  private static buildSpansByInvocationId(
    traceView: TelemetryRunTraceViewDto | undefined,
    spanName: string,
  ): ReadonlyMap<string, TelemetrySpan> {
    return new Map(
      (traceView?.spans ?? [])
        .filter((span) => span.name === spanName && typeof span.connectionInvocationId === "string")
        .map((span) => [span.connectionInvocationId as string, span]),
    );
  }

  private static getConnectionSpanIds(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
    traceView: TelemetryRunTraceViewDto | undefined,
    spanName: string,
  ): ReadonlySet<string> {
    const invocationIds = new Set(
      connectionInvocations
        .filter((invocation) => invocation.connectionNodeId === node.id)
        .map((invocation) => invocation.invocationId),
    );
    return new Set(
      (traceView?.spans ?? [])
        .filter(
          (span) =>
            span.name === spanName && span.connectionInvocationId && invocationIds.has(span.connectionInvocationId),
        )
        .map((span) => span.spanId),
    );
  }

  private static getLatestConnectionInvocation(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
  ): ConnectionInvocationRecord | undefined {
    return connectionInvocations
      .filter((invocation) => invocation.connectionNodeId === node.id)
      .sort((left, right) => this.compareIso(right.updatedAt, left.updatedAt))[0];
  }

  private static toMessageTableRows(value: unknown): ReadonlyArray<Readonly<Record<string, string>>> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map((row) => ({
        messageId: this.toStringValue(row["messageId"]),
        subject: this.toStringValue(row["subject"]),
        from: this.toStringValue(row["from"]),
        attachmentCount: this.toStringValue(row["attachmentCount"]),
        attachmentBytes: this.toStringValue(row["attachmentBytes"]),
      }));
  }

  private static sumMetrics(points: ReadonlyArray<TelemetryMetricPoint>, metricName: string): string {
    return String(
      points.filter((point) => point.metricName === metricName).reduce((sum, point) => sum + point.value, 0),
    );
  }

  private static createCostKeyValues(
    points: ReadonlyArray<TelemetryMetricPoint>,
  ): ReadonlyArray<NodeInspectorKeyValueModel> {
    return this.summarizeCosts(points).map((entry) => ({
      label: `Estimated cost (${entry.currency})`,
      value: this.formatCostAmount(entry.currency, entry.amountMinor, entry.currencyScale),
    }));
  }

  private static createCostPills(points: ReadonlyArray<TelemetryMetricPoint>): ReadonlyArray<NodeInspectorPillModel> {
    return this.summarizeCosts(points).map((entry) => ({
      label: `Cost (${entry.currency})`,
      value: this.formatCostAmount(entry.currency, entry.amountMinor, entry.currencyScale),
    }));
  }

  private static summarizeCosts(
    points: ReadonlyArray<TelemetryMetricPoint>,
  ): ReadonlyArray<Readonly<{ currency: string; currencyScale: number; amountMinor: number }>> {
    const totals = new Map<string, { currency: string; currencyScale: number; amountMinor: number }>();
    for (const point of points) {
      if (point.metricName !== InspectorTelemetryMetricNames.billingEstimatedCost) {
        continue;
      }
      const currency = this.readCostCurrency(point);
      const currencyScale = this.readCostCurrencyScale(point);
      if (!currency || currencyScale === undefined) {
        continue;
      }
      const key = `${currency}::${String(currencyScale)}`;
      const existing = totals.get(key);
      if (existing) {
        existing.amountMinor += point.value;
        continue;
      }
      totals.set(key, {
        currency,
        currencyScale,
        amountMinor: point.value,
      });
    }
    return [...totals.values()].sort((left, right) => left.currency.localeCompare(right.currency));
  }

  private static readCostCurrency(point: TelemetryMetricPoint): string | undefined {
    const value = point.dimensions?.[InspectorCostAttributeNames.currency];
    return typeof value === "string" && value.length > 0 ? value : point.unit;
  }

  private static readCostCurrencyScale(point: TelemetryMetricPoint): number | undefined {
    const value = point.dimensions?.[InspectorCostAttributeNames.currencyScale];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  private static formatCostAmount(currency: string, amountMinor: number, currencyScale: number): string {
    const normalizedAmount = currencyScale > 0 ? amountMinor / currencyScale : amountMinor;
    const fractionDigits = currencyScale > 1 ? Math.min(9, Math.max(2, String(currencyScale).length - 1)) : 2;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: fractionDigits,
    }).format(normalizedAmount);
  }

  private static joinUnique(values: ReadonlyArray<string>): string {
    const unique = [...new Set(values.filter((value) => value.length > 0))];
    return unique.length > 0 ? unique.join(", ") : "—";
  }

  private static formatWhen(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }

  private static formatDuration(startedAt: string, finishedAt: string): string {
    const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
    if (durationMs < 1_000) {
      return `${durationMs} ms`;
    }
    if (durationMs < 60_000) {
      return `${(durationMs / 1_000).toFixed(1)} s`;
    }
    return `${(durationMs / 60_000).toFixed(1)} min`;
  }

  private static compareIso(left: string | undefined, right: string | undefined): number {
    return (left ?? "").localeCompare(right ?? "");
  }

  private static toStringValue(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return "—";
  }

  private static sectionHasContent(section: NodeInspectorSectionModel): boolean {
    return Boolean(
      section.pills?.length ||
      section.keyValues?.length ||
      section.table?.rows.length ||
      section.jsonBlocks?.length ||
      section.timeline?.length ||
      section.emptyLabel,
    );
  }

  private static isAiAgentNode(node: WorkflowDiagramNode): boolean {
    return node.role === "agent" || node.type === "AIAgent";
  }

  private static isLanguageModelNode(node: WorkflowDiagramNode): boolean {
    return node.role === "languageModel";
  }

  private static isToolNode(node: WorkflowDiagramNode): boolean {
    return node.role === "tool" || node.role === "nestedAgent";
  }

  private static isGmailTriggerNode(node: WorkflowDiagramNode): boolean {
    return node.type.includes("Gmail") || node.icon === "si:gmail";
  }
}
