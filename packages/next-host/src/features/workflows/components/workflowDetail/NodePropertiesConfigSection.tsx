import { useEffect, useMemo, useState } from "react";
import type {
  ConnectionInvocationRecord,
  NodeExecutionSnapshot,
  TelemetryRunTraceViewDto,
} from "../../hooks/realtime/realtime";
import { NodeInspectorTelemetryPresenter } from "../../lib/workflowDetail/NodeInspectorTelemetryPresenter";
import type { WorkflowDiagramNode } from "../../lib/workflowDetail/workflowDetailTypes";
import { NodePropertiesSectionRenderer } from "./NodePropertiesSectionRenderer";

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
  const sectionIdsKey = useMemo(() => model.sections.map((section) => section.id).join("|"), [model.sections]);
  const [openSectionIds, setOpenSectionIds] = useState<ReadonlySet<string>>(
    () => new Set(model.sections.map((section) => section.id)),
  );

  useEffect(() => {
    setOpenSectionIds(new Set(model.sections.map((section) => section.id)));
  }, [node.id, sectionIdsKey]);

  return (
    <section data-testid="node-properties-config-section" className="border-b border-border px-3 py-3">
      <div className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase opacity-80">
        Inspector
      </div>
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
      <div className="mt-3 border-t border-border/60">
        {model.sections.map((section, index) =>
          NodePropertiesSectionRenderer.render({
            section,
            isOpen: openSectionIds.has(section.id),
            onToggle: (isOpen) => {
              setOpenSectionIds((current) => {
                const next = new Set(current);
                if (isOpen) {
                  next.add(section.id);
                } else {
                  next.delete(section.id);
                }
                return next;
              });
            },
            isLastSection: index === model.sections.length - 1,
          }),
        )}
      </div>
    </section>
  );
}
