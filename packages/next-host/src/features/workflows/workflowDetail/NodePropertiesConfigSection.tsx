import type { WorkflowDiagramNode } from "./workflowDetailTypes";

export function NodePropertiesConfigSection(args: Readonly<{ node: WorkflowDiagramNode }>) {
  const { node } = args;
  return (
    <section data-testid="node-properties-config-section" style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.64 }}>Configuration</div>
      <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.5, color: "#475569" }}>
        TODO: surface real node configuration here later, such as model parameters, tool wiring, trigger settings, and execution hints.
      </p>
      <div
        style={{
          marginTop: 10,
          padding: 10,
          border: "1px dashed #cbd5e1",
          background: "#f8fafc",
          fontSize: 11,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          color: "#334155",
          lineHeight: 1.55,
        }}
      >
        <div>{`kind: ${node.kind}`}</div>
        <div>{`type: ${node.type}`}</div>
        {node.role ? <div>{`role: ${node.role}`}</div> : null}
        {node.parentNodeId ? <div>{`parentNodeId: ${node.parentNodeId}`}</div> : null}
      </div>
    </section>
  );
}
