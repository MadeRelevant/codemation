import { X } from "lucide-react";

export function NodePropertiesPanelHeader(args: Readonly<{
  title: string;
  subtitle?: string;
  onClose: () => void;
}>) {
  const { onClose, subtitle, title } = args;
  return (
    <div
      data-testid="node-properties-panel-header"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        padding: "12px 12px 10px",
        borderBottom: "1px solid #e5e7eb",
        background: "#fafafa",
        flexShrink: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.64 }}>
          Node properties
        </div>
        <div
          data-testid="node-properties-panel-title"
          style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: "#111827", lineHeight: 1.25, wordBreak: "break-word" }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            data-testid="node-properties-panel-subtitle"
            style={{ marginTop: 4, fontSize: 11, color: "#64748b", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", wordBreak: "break-all" }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        data-testid="node-properties-panel-close"
        aria-label="Close node properties"
        onClick={onClose}
        style={{
          flex: "0 0 auto",
          width: 32,
          height: 32,
          display: "grid",
          placeItems: "center",
          border: "1px solid #d1d5db",
          background: "#fff",
          color: "#111827",
          cursor: "pointer",
        }}
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
