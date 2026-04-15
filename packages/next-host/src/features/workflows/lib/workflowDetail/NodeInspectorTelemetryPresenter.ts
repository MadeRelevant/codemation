import type { TelemetryRunTraceViewDto } from "@codemation/host-src/application/contracts/TelemetryRunTraceContracts";
import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../hooks/realtime/realtime";
import { CodemationTelemetryMetricNames, GenAiTelemetryAttributeNames } from "@codemation/core";

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
  pills?: ReadonlyArray<NodeInspectorPillModel>;
  jsonBlocks?: ReadonlyArray<NodeInspectorJsonBlockModel>;
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
}>;

export type NodeInspectorTelemetryModel = Readonly<{
  sections: ReadonlyArray<NodeInspectorSectionModel>;
}>;

type TelemetrySpan = TelemetryRunTraceViewDto["spans"][number];
type TelemetryMetricPoint = TelemetryRunTraceViewDto["metricPoints"][number];

export class NodeInspectorTelemetryPresenter {
  static create(
    args: Readonly<{
      node: WorkflowDiagramNode;
      nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
      connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
      traceView?: TelemetryRunTraceViewDto;
    }>,
  ): NodeInspectorTelemetryModel {
    const sections: NodeInspectorSectionModel[] = [
      this.createIdentitySection(args.node),
      this.createExecutionSection(args.node, args.nodeSnapshotsByNodeId, args.connectionInvocations),
    ];
    if (this.isAiAgentNode(args.node)) {
      sections.push(this.createAgentMetricsSection(args.node, args.traceView));
      sections.push(this.createAgentTimelineSection(args.node, args.traceView));
    } else if (this.isLanguageModelNode(args.node)) {
      sections.push(this.createLanguageModelMetricsSection(args.node, args.connectionInvocations, args.traceView));
      sections.push(this.createLanguageModelTimelineSection(args.node, args.connectionInvocations, args.traceView));
    } else if (this.isToolNode(args.node)) {
      sections.push(this.createToolMetricsSection(args.node, args.connectionInvocations));
      sections.push(this.createToolTimelineSection(args.node, args.connectionInvocations, args.traceView));
    } else if (this.isGmailTriggerNode(args.node)) {
      sections.push(this.createGmailMetricsSection(args.node, args.traceView));
      sections.push(this.createGmailMessagesSection(args.node, args.traceView));
    }
    return {
      sections: sections.filter((section) => this.sectionHasContent(section)),
    };
  }

  private static createIdentitySection(node: WorkflowDiagramNode): NodeInspectorSectionModel {
    return {
      id: "identity",
      title: "Overview",
      pills: [
        { label: "Kind", value: node.kind },
        { label: "Type", value: node.type },
        ...(node.role ? [{ label: "Role", value: node.role }] : []),
      ],
      keyValues: [
        { label: "Retry", value: node.retryPolicySummary ?? "None" },
        { label: "Node error handler", value: node.hasNodeErrorHandler ? "Configured" : "Not configured" },
        ...(node.parentNodeId ? [{ label: "Parent node", value: node.parentNodeId }] : []),
      ],
    };
  }

  private static createExecutionSection(
    node: WorkflowDiagramNode,
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
  ): NodeInspectorSectionModel {
    const snapshot = nodeSnapshotsByNodeId[node.id];
    const latestInvocation = this.getLatestConnectionInvocation(node, connectionInvocations);
    const status = snapshot?.status ?? latestInvocation?.status ?? "idle";
    const updatedAt = snapshot?.updatedAt ?? latestInvocation?.updatedAt;
    const startedAt =
      snapshot?.startedAt ?? latestInvocation?.startedAt ?? snapshot?.queuedAt ?? latestInvocation?.queuedAt;
    const finishedAt = snapshot?.finishedAt ?? latestInvocation?.finishedAt;
    const inputsCount = this.countPortItems(snapshot?.inputsByPort);
    const outputsCount = this.countPortItems(snapshot?.outputs);
    return {
      id: "execution",
      title: "Execution",
      pills: [
        { label: "Status", value: status },
        ...(startedAt && finishedAt ? [{ label: "Duration", value: this.formatDuration(startedAt, finishedAt) }] : []),
      ],
      keyValues: [
        ...(updatedAt ? [{ label: "Last updated", value: this.formatWhen(updatedAt) }] : []),
        ...(inputsCount !== null ? [{ label: "Input items", value: String(inputsCount) }] : []),
        ...(outputsCount !== null ? [{ label: "Output items", value: String(outputsCount) }] : []),
      ],
    };
  }

  private static createAgentMetricsSection(
    node: WorkflowDiagramNode,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): NodeInspectorSectionModel {
    const metricPoints = this.getMetricPointsForNode(node, traceView);
    const spans = this.getSpansForNode(node, traceView).filter((span) => span.name === "gen_ai.chat.completion");
    return {
      id: "agent-metrics",
      title: "AI metrics",
      pills: [
        { label: "Turns", value: this.sumMetrics(metricPoints, CodemationTelemetryMetricNames.agentTurns) },
        { label: "Tool calls", value: this.sumMetrics(metricPoints, CodemationTelemetryMetricNames.agentToolCalls) },
        { label: "Input tokens", value: this.sumMetrics(metricPoints, GenAiTelemetryAttributeNames.usageInputTokens) },
        {
          label: "Output tokens",
          value: this.sumMetrics(metricPoints, GenAiTelemetryAttributeNames.usageOutputTokens),
        },
        {
          label: "Cached tokens",
          value: this.sumMetrics(metricPoints, GenAiTelemetryAttributeNames.usageCacheReadInputTokens),
        },
        {
          label: "Reasoning tokens",
          value: this.sumMetrics(metricPoints, GenAiTelemetryAttributeNames.usageReasoningTokens),
        },
        {
          label: "Models",
          value: this.joinUnique(
            spans
              .map((span) => span.modelName)
              .filter((value): value is string => typeof value === "string" && value.length > 0),
          ),
        },
      ],
    };
  }

  private static createAgentTimelineSection(
    node: WorkflowDiagramNode,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): NodeInspectorSectionModel {
    const spans = this.getSpansForNode(node, traceView).filter(
      (span) => span.name === "gen_ai.chat.completion" || span.name === "agent.tool.call",
    );
    return {
      id: "agent-timeline",
      title: "Conversation and tool timeline",
      timeline: spans
        .sort((left, right) => this.compareIso(left.startTime, right.startTime))
        .map((span) => this.createTimelineEntry(span, traceView)),
      emptyLabel: "Run this agent to inspect model turns and tool calls.",
    };
  }

  private static createLanguageModelMetricsSection(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): NodeInspectorSectionModel {
    const spanIds = this.getConnectionSpanIds(node, connectionInvocations, traceView, "gen_ai.chat.completion");
    const metricPoints = (traceView?.metricPoints ?? []).filter((point) => spanIds.has(point.spanId ?? ""));
    const spans = (traceView?.spans ?? []).filter((span) => spanIds.has(span.spanId));
    return {
      id: "language-model-metrics",
      title: "Chat model metrics",
      pills: [
        { label: "Invocations", value: String(spanIds.size) },
        { label: "Input tokens", value: this.sumMetrics(metricPoints, GenAiTelemetryAttributeNames.usageInputTokens) },
        {
          label: "Output tokens",
          value: this.sumMetrics(metricPoints, GenAiTelemetryAttributeNames.usageOutputTokens),
        },
        { label: "Total tokens", value: this.sumMetrics(metricPoints, GenAiTelemetryAttributeNames.usageTotalTokens) },
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
  ): NodeInspectorSectionModel {
    const spanIds = this.getConnectionSpanIds(node, connectionInvocations, traceView, "gen_ai.chat.completion");
    const spans = (traceView?.spans ?? []).filter((span) => spanIds.has(span.spanId));
    return {
      id: "language-model-timeline",
      title: "Model responses",
      timeline: spans
        .sort((left, right) => this.compareIso(left.startTime, right.startTime))
        .map((span) => this.createTimelineEntry(span, traceView)),
      emptyLabel: "No model invocations captured for this run yet.",
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
      ],
    };
  }

  private static createToolTimelineSection(
    node: WorkflowDiagramNode,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
    traceView: TelemetryRunTraceViewDto | undefined,
  ): NodeInspectorSectionModel {
    const spanIds = this.getConnectionSpanIds(node, connectionInvocations, traceView, "agent.tool.call");
    const spans = (traceView?.spans ?? []).filter((span) => spanIds.has(span.spanId));
    return {
      id: "tool-timeline",
      title: "Tool inputs and outputs",
      timeline: spans
        .sort((left, right) => this.compareIso(left.startTime, right.startTime))
        .map((span) => this.createTimelineEntry(span, traceView)),
      emptyLabel: "No tool calls captured for this run yet.",
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
          value: this.sumMetrics(metricPoints, CodemationTelemetryMetricNames.gmailMessagesEmitted),
        },
        { label: "Attachments", value: this.sumMetrics(metricPoints, CodemationTelemetryMetricNames.gmailAttachments) },
        {
          label: "Attachment bytes",
          value: this.sumMetrics(metricPoints, CodemationTelemetryMetricNames.gmailAttachmentBytes),
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
    const segments = [
      span.startTime ? this.formatWhen(span.startTime) : undefined,
      span.connectionInvocationId ? `Invocation ${span.connectionInvocationId}` : undefined,
    ].filter((value): value is string => Boolean(value));
    return segments.length > 0 ? segments.join(" · ") : undefined;
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

  private static joinUnique(values: ReadonlyArray<string>): string {
    const unique = [...new Set(values.filter((value) => value.length > 0))];
    return unique.length > 0 ? unique.join(", ") : "—";
  }

  private static countPortItems(ports: Readonly<Record<string, ReadonlyArray<unknown>>> | undefined): number | null {
    if (!ports) {
      return null;
    }
    return Object.values(ports).reduce((sum, items) => sum + items.length, 0);
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
