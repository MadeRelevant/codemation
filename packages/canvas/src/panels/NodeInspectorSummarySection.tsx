import type { WorkflowDiagramNode } from "@codemation/canvas";
import { NodeInspectorSummaryRow } from "./NodeInspectorSummaryRow";

/**
 * Renders the static configuration summary that node authors return from
 * `NodeConfigBase.inspectorSummary()` (or the `defineNode({ inspectorSummary })` option).
 *
 * Sits above the telemetry-driven Inspector so authors can see *what this node will do*
 * at design time — before any run exists, the telemetry pane is empty by definition.
 *
 * Hidden when no rows are produced; node kinds without a summary contribute nothing
 * and the section simply doesn't render.
 */
export function NodeInspectorSummarySection(args: Readonly<{ node: WorkflowDiagramNode }>) {
  const rows = args.node.inspectorSummary;
  if (!rows || rows.length === 0) {
    return null;
  }
  return (
    <section
      data-testid="node-properties-inspector-summary-section"
      className="border-b border-border bg-muted/20 px-3 py-3"
    >
      <div className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase opacity-80">
        Configuration
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map((row, index) => (
          <NodeInspectorSummaryRow key={`${row.label}-${index}`} label={row.label} value={row.value} />
        ))}
      </dl>
    </section>
  );
}
