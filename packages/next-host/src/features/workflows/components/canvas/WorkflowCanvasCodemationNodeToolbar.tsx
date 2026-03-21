import { Pencil,Pin,PinOff,Play } from "lucide-react";

import type { WorkflowCanvasNodeData } from "./lib/workflowCanvasNodeData";
import { WorkflowCanvasToolbarIconButton } from "./WorkflowCanvasToolbarIconButton";

export function WorkflowCanvasCodemationNodeToolbar(props: Readonly<{
  data: WorkflowCanvasNodeData;
  isPinned: boolean;
  isToolbarVisible: boolean;
  setHasToolbarFocus: (value: boolean) => void;
}>) {
  const { data, isPinned, isToolbarVisible, setHasToolbarFocus } = props;
  return (
    <div
      data-testid={`canvas-node-toolbar-${data.nodeId}`}
      style={{
        position: "absolute",
        top: -34,
        right: 0,
        display: "flex",
        alignItems: "center",
        gap: 4,
        opacity: isToolbarVisible ? 1 : 0,
        transform: isToolbarVisible ? "translateY(0)" : "translateY(3px)",
        transition: "opacity 90ms ease-out, transform 90ms ease-out",
        pointerEvents: isToolbarVisible ? "auto" : "none",
        padding: 4,
        background: "rgba(255,255,255,0.96)",
        boxShadow: "0 8px 18px rgba(15,23,42,0.12)",
        zIndex: 30,
      }}
    >
      <WorkflowCanvasToolbarIconButton
        testId={`canvas-node-run-button-${data.nodeId}`}
        ariaLabel={`Run to ${data.label}`}
        tooltip={data.isRunning ? "Run disabled while workflow is running" : "Run from here"}
        onAfterClick={() => setHasToolbarFocus(false)}
        onClick={(event) => {
          event.stopPropagation();
          data.onSelectNode(data.nodeId);
          data.onRunNode(data.nodeId);
        }}
        disabled={data.isRunning}
      >
        <Play size={12} strokeWidth={2.1} />
      </WorkflowCanvasToolbarIconButton>
      <WorkflowCanvasToolbarIconButton
        testId={`${isPinned ? "canvas-node-unpin-button" : "canvas-node-pin-button"}-${data.nodeId}`}
        ariaLabel={`${isPinned ? "Unpin" : "Pin"} ${data.label}`}
        tooltip={
          !data.hasOutputData ? "No output to pin yet" : isPinned ? "Unpin output" : "Pin current output"
        }
        onAfterClick={() => setHasToolbarFocus(false)}
        onClick={(event) => {
          event.stopPropagation();
          data.onSelectNode(data.nodeId);
          data.onTogglePinnedOutput(data.nodeId);
        }}
        disabled={!data.hasOutputData}
        accentColor="#6d28d9"
      >
        {isPinned ? <PinOff size={12} strokeWidth={2.3} fill="currentColor" /> : <Pin size={12} strokeWidth={2} />}
      </WorkflowCanvasToolbarIconButton>
      <WorkflowCanvasToolbarIconButton
        testId={`canvas-node-edit-button-${data.nodeId}`}
        ariaLabel={`Edit ${data.label}`}
        tooltip="Edit output"
        onAfterClick={() => setHasToolbarFocus(false)}
        onClick={(event) => {
          event.stopPropagation();
          data.onSelectNode(data.nodeId);
          data.onEditNodeOutput(data.nodeId);
        }}
      >
        <Pencil size={12} strokeWidth={2} />
      </WorkflowCanvasToolbarIconButton>
    </div>
  );
}
