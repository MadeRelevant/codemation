export function WorkflowCanvasLoadingPlaceholder(props: Readonly<{ isInitialViewportReady: boolean }>) {
  const { isInitialViewportReady } = props;
  return (
    <div
      aria-hidden={isInitialViewportReady}
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        opacity: isInitialViewportReady ? 0 : 1,
        transition: "opacity 180ms ease-out",
        background:
          "linear-gradient(rgba(251,251,252,0.96), rgba(251,251,252,0.96)), radial-gradient(circle at center, rgba(15,23,42,0.04) 1px, transparent 1px)",
        backgroundSize: "auto, 18px 18px",
      }}
    >
      <div
        style={{
          minWidth: 220,
          padding: "16px 18px",
          border: "1px solid #e5e7eb",
          background: "rgba(255,255,255,0.94)",
          boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              background: "#2563eb",
              animation: "codemationCanvasLoaderPulse 1s ease-in-out infinite",
            }}
          />
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", color: "#475569" }}>
            Workflow diagram
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Loading...</div>
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              height: 8,
              width: 176,
              background: "linear-gradient(90deg, #e5e7eb, #f8fafc, #e5e7eb)",
              backgroundSize: "200% 100%",
              animation: "codemationCanvasLoaderShimmer 1.4s linear infinite",
            }}
          />
          <div
            style={{
              height: 8,
              width: 132,
              background: "linear-gradient(90deg, #e5e7eb, #f8fafc, #e5e7eb)",
              backgroundSize: "200% 100%",
              animation: "codemationCanvasLoaderShimmer 1.4s linear infinite",
            }}
          />
        </div>
      </div>
    </div>
  );
}
