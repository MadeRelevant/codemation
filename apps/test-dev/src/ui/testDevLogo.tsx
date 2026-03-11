export function TestDevLogo() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        border: "1px solid #111827",
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.45,
        textTransform: "uppercase",
        background: "#111827",
        color: "white",
      }}
    >
      <span>Codemation</span>
      <span style={{ opacity: 0.7 }}>/</span>
      <span>Test Dev</span>
    </div>
  );
}
