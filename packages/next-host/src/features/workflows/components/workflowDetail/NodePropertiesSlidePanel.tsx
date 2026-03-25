import { cn } from "@/lib/utils";

import { NodeCredentialBindingsSection } from "./NodeCredentialBindingsSection";
import { NodePropertiesConfigSection } from "./NodePropertiesConfigSection";
import { NodePropertiesPanelHeader } from "./NodePropertiesPanelHeader";
import { WorkflowDetailPresenter } from "../../lib/workflowDetail/WorkflowDetailPresenter";
import type { WorkflowDiagramNode } from "../../lib/workflowDetail/workflowDetailTypes";

const panelWidthPx = 300;

export function NodePropertiesSlidePanel(
  args: Readonly<{
    workflowId: string;
    isOpen: boolean;
    node: WorkflowDiagramNode | undefined;
    onClose: () => void;
  }>,
) {
  const { isOpen, node, onClose, workflowId } = args;
  const isVisible = isOpen && Boolean(node);
  return (
    <aside
      data-testid="node-properties-slide-panel"
      aria-hidden={!isVisible}
      className={cn(
        "flex min-h-0 flex-shrink-0 flex-col overflow-hidden bg-card transition-[width] duration-200 ease-out",
        isVisible && "border-l border-border shadow-[-6px_0_18px_rgba(15,23,42,0.06)]",
      )}
      style={{
        width: isVisible ? panelWidthPx : 0,
      }}
    >
      {isVisible && node ? (
        <div data-testid="node-properties-panel" className="flex h-full min-h-0 w-[300px] flex-col">
          <NodePropertiesPanelHeader
            title={WorkflowDetailPresenter.getNodeDisplayName(node, node.id)}
            subtitle={node.id}
            onClose={onClose}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <NodePropertiesConfigSection node={node} />
            <NodeCredentialBindingsSection workflowId={workflowId} node={node} />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
