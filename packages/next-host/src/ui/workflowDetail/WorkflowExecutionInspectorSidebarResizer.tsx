export function WorkflowExecutionInspectorSidebarResizer(props: Readonly<{
  widthPx: number;
  isResizing: boolean;
  onResizeStart: (clientX: number, currentWidth: number) => void;
}>) {
  const { isResizing, onResizeStart, widthPx } = props;
  const TREE_RESIZE_HANDLE_WIDTH_PX = 8;
  return (
    <div
      data-testid="workflow-execution-tree-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize execution tree"
      onMouseDown={(event) => {
        event.preventDefault();
        onResizeStart(event.clientX, widthPx);
      }}
      style={{
        position: "relative",
        zIndex: 10,
        width: TREE_RESIZE_HANDLE_WIDTH_PX,
        cursor: "col-resize",
        background: isResizing ? "#bfdbfe" : "#e5e7eb",
        borderLeft: "1px solid #d1d5db",
        borderRight: "1px solid #d1d5db",
      }}
    />
  );
}
