export function WorkflowCanvasCodemationNodeAgentLabels() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          bottom: -22,
          left: "34%",
          transform: "translateX(-50%)",
          padding: "2px 6px",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.35,
          textTransform: "uppercase",
          color: "#1d4ed8",
          background: "#eff6ff",
          border: "1px dotted #93c5fd",
          whiteSpace: "nowrap",
        }}
      >
        LLM
      </div>
      <div
        style={{
          position: "absolute",
          bottom: -22,
          left: "66%",
          transform: "translateX(-50%)",
          padding: "2px 6px",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.35,
          textTransform: "uppercase",
          color: "#6d28d9",
          background: "#f5f3ff",
          border: "1px dotted #c4b5fd",
          whiteSpace: "nowrap",
        }}
      >
        Tools
      </div>
    </>
  );
}
