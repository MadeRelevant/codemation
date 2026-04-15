import type { JSX } from "react";
import type { TelemetryRunTraceViewDto } from "@codemation/host-src/application/contracts/TelemetryRunTraceContracts";
import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../hooks/realtime/realtime";
import {
  NodeInspectorTelemetryPresenter,
  type NodeInspectorJsonBlockModel,
  type NodeInspectorSectionModel,
  type NodeInspectorTableModel,
  type NodeInspectorTimelineEntryModel,
} from "../../lib/workflowDetail/NodeInspectorTelemetryPresenter";
import type { WorkflowDiagramNode } from "../../lib/workflowDetail/workflowDetailTypes";

export function NodePropertiesConfigSection(
  args: Readonly<{
    node: WorkflowDiagramNode;
    telemetryRunId: string | null;
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
    telemetryRunTrace: TelemetryRunTraceViewDto | undefined;
    telemetryIsLoading: boolean;
    telemetryLoadError: string | null;
  }>,
) {
  const {
    node,
    telemetryRunId,
    nodeSnapshotsByNodeId,
    connectionInvocations,
    telemetryRunTrace,
    telemetryIsLoading,
    telemetryLoadError,
  } = args;
  const model = NodeInspectorTelemetryPresenter.create({
    node,
    nodeSnapshotsByNodeId,
    connectionInvocations,
    traceView: telemetryRunTrace,
  });
  return (
    <section data-testid="node-properties-config-section" className="border-b border-border px-3 py-3">
      <div className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase opacity-80">
        Inspector
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Rich node details are powered by the same telemetry foundation as dashboarding, with node-specific sections for
        AI and Gmail where trace data is available.
      </p>
      {telemetryIsLoading ? (
        <div
          data-testid="node-properties-telemetry-loading"
          className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs"
        >
          Loading node telemetry…
        </div>
      ) : null}
      {telemetryLoadError ? (
        <div
          data-testid="node-properties-telemetry-error"
          className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {telemetryLoadError}
        </div>
      ) : null}
      {!telemetryIsLoading && !telemetryLoadError && !telemetryRunId ? (
        <div
          data-testid="node-properties-telemetry-hint"
          className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs"
        >
          Select or start a run to inspect node-level telemetry beyond static workflow metadata.
        </div>
      ) : null}
      <div className="mt-3 grid gap-3">
        {model.sections.map((section) => NodePropertiesSectionRenderer.render({ section }))}
      </div>
    </section>
  );
}

class NodePropertiesSectionRenderer {
  static renderJsonBlock(block: NodeInspectorJsonBlockModel, index: number): JSX.Element {
    return (
      <div key={`${block.label}-${String(index)}`} className="grid gap-1">
        <div className="text-[11px] font-bold text-muted-foreground">{block.label}</div>
        <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-5 text-foreground whitespace-pre-wrap break-words">
          {JSON.stringify(block.value, null, 2)}
        </pre>
      </div>
    );
  }

  static renderTable(table: NodeInspectorTableModel): JSX.Element {
    return (
      <div className="overflow-auto rounded-md border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-muted/50">
            <tr>
              {table.columns.map((column) => (
                <th key={column} className="px-2 py-2 font-bold text-foreground">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${table.columns.join("-")}`} className="border-t">
                {table.columns.map((column) => (
                  <td key={`${rowIndex}-${column}`} className="px-2 py-2 align-top text-muted-foreground">
                    {row[column] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  static renderTimelineEntry(entry: NodeInspectorTimelineEntryModel): JSX.Element {
    return (
      <div key={entry.key} className="rounded-md border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-bold text-foreground">{entry.title}</div>
          {entry.pills?.map((pill) => (
            <span
              key={`${entry.key}-${pill.label}`}
              className="inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              {pill.label}: {pill.value}
            </span>
          ))}
        </div>
        {entry.subtitle ? <div className="mt-1 text-[11px] text-muted-foreground">{entry.subtitle}</div> : null}
        {entry.jsonBlocks?.length ? (
          <div className="mt-3 grid gap-3">
            {entry.jsonBlocks.map((block, index) => this.renderJsonBlock(block, index))}
          </div>
        ) : null}
      </div>
    );
  }

  static render(props: Readonly<{ section: NodeInspectorSectionModel }>): JSX.Element {
    const { section } = props;
    return (
      <div
        key={section.id}
        data-testid={`node-properties-section-${section.id}`}
        className="rounded-lg border bg-card/70 px-3 py-3"
      >
        <div className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">{section.title}</div>
        {section.description ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{section.description}</p>
        ) : null}
        {section.pills?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {section.pills.map((pill) => (
              <span
                key={`${section.id}-${pill.label}`}
                className="inline-flex items-center rounded-full border bg-muted px-2.5 py-1 text-[11px] font-bold text-foreground"
              >
                <span className="mr-1 text-muted-foreground">{pill.label}</span>
                <span>{pill.value}</span>
              </span>
            ))}
          </div>
        ) : null}
        {section.keyValues?.length ? (
          <div className="mt-3 grid gap-2 text-xs">
            {section.keyValues.map((entry) => (
              <div key={`${section.id}-${entry.label}`} className="grid gap-1">
                <div className="font-bold text-muted-foreground">{entry.label}</div>
                <div className="text-foreground">{entry.value}</div>
              </div>
            ))}
          </div>
        ) : null}
        {section.table ? <div className="mt-3">{this.renderTable(section.table)}</div> : null}
        {section.timeline?.length ? (
          <div className="mt-3 grid gap-3">{section.timeline.map((entry) => this.renderTimelineEntry(entry))}</div>
        ) : null}
        {section.jsonBlocks?.length ? (
          <div className="mt-3 grid gap-3">
            {section.jsonBlocks.map((block, index) => this.renderJsonBlock(block, index))}
          </div>
        ) : null}
        {!section.pills?.length &&
        !section.keyValues?.length &&
        !section.table &&
        !section.timeline?.length &&
        !section.jsonBlocks?.length &&
        section.emptyLabel ? (
          <div className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {section.emptyLabel}
          </div>
        ) : null}
      </div>
    );
  }
}
