import { NodeCredentialBindingsSection } from "./NodeCredentialBindingsSection";
import { NodePropertiesConfigSection } from "./NodePropertiesConfigSection";
import { NodePropertiesPanelHeader } from "./NodePropertiesPanelHeader";
import { WorkflowDetailPresenter } from "./WorkflowDetailPresenter";
import type { WorkflowDiagramNode } from "./workflowDetailTypes";

const panelWidthPx = 300;

export function NodePropertiesSlidePanel(args: Readonly<{
  workflowId: string;
  isOpen: boolean;
  node: WorkflowDiagramNode | undefined;
  onClose: () => void;
}>) {
  const { isOpen, node, onClose, workflowId } = args;
  const isVisible = isOpen && Boolean(node);
  return (
    <aside
      data-testid="node-properties-slide-panel"
      aria-hidden={!isVisible}
      style={{
        flex: "0 0 auto",
        width: isVisible ? panelWidthPx : 0,
        minWidth: 0,
        transition: "width 200ms ease",
        overflow: "hidden",
        borderLeft: isVisible ? "1px solid #d1d5db" : "none",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        boxShadow: isVisible ? "-6px 0 18px rgba(15,23,42,0.06)" : "none",
      }}
    >
      {isVisible && node ? (
        <div data-testid="node-properties-panel" style={{ width: panelWidthPx, minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }}>
          <NodePropertiesPanelHeader
            title={WorkflowDetailPresenter.getNodeDisplayName(node, node.id)}
            subtitle={node.id}
            onClose={onClose}
          />
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <NodePropertiesConfigSection node={node} />
            <NodeCredentialBindingsSection workflowId={workflowId} node={node} />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
