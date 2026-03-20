import { Check,Copy } from "lucide-react";
import { useState } from "react";

import type { CopyState,NodeExecutionError } from "./workflowDetailTypes";

export function WorkflowInspectorErrorView(args: Readonly<{ error: NodeExecutionError | undefined; emptyLabel: string; getErrorHeadline: (error: NodeExecutionError | undefined) => string; getErrorStack: (error: NodeExecutionError | undefined) => string | null; getErrorClipboardText: (error: NodeExecutionError | undefined) => string }>) {
  const { error, emptyLabel, getErrorClipboardText, getErrorHeadline, getErrorStack } = args;
  const [copyState, setCopyState] = useState<CopyState>("idle");

  if (!error) {
    return <div data-testid="workflow-inspector-empty-state" style={{ opacity: 0.62, fontSize: 13 }}>{emptyLabel}</div>;
  }

  const headline = getErrorHeadline(error);
  const stack = getErrorStack(error);

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto auto 1fr", gap: 10 }}>
      <div style={{ display: "grid", gap: 8, border: "1px solid #fecaca", background: "#fef2f2", padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", color: "#991b1b" }}>Error</div>
        <div
          data-testid="workflow-inspector-error-headline"
          style={{ fontSize: 13, lineHeight: 1.55, color: "#111827", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
        >
          {headline}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12, color: "#4b5563" }}>{stack ? "Full stacktrace" : "No stacktrace was captured for this error."}</div>
        <button
          onClick={() => {
            const value = getErrorClipboardText(error);
            if (!value) return;
            void navigator.clipboard.writeText(value).then(() => {
              setCopyState("copied");
              window.setTimeout(() => setCopyState("idle"), 1500);
            });
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid #d1d5db",
            background: "white",
            padding: "6px 10px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 12,
            color: "#111827",
          }}
        >
          {copyState === "copied" ? <Check size={14} strokeWidth={2.2} /> : <Copy size={14} strokeWidth={2.2} />}
          {copyState === "copied" ? "Copied" : "Copy stacktrace"}
        </button>
      </div>
      <div style={{ minWidth: 0, overflowX: "hidden", overflowY: "auto", border: "1px solid #d1d5db", background: "#0f172a", color: "#e2e8f0", padding: 12 }}>
        <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          {stack ?? headline}
        </pre>
      </div>
    </div>
  );
}
