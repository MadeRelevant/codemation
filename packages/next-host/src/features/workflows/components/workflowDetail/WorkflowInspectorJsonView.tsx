import JsonView from "@uiw/react-json-view";
import { githubLightTheme } from "@uiw/react-json-view/githubLight";
import { useState } from "react";

import type { CopyState } from "../../lib/workflowDetail/workflowDetailTypes";

export function WorkflowInspectorJsonView(args: Readonly<{ value: unknown; emptyLabel: string }>) {
  const { value, emptyLabel } = args;
  const [collapsedLevel, setCollapsedLevel] = useState<boolean | number>(1);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const isRenderableJson = value !== null && typeof value === "object";

  if (value === undefined) {
    return <div data-testid="workflow-inspector-empty-state" style={{ opacity: 0.62, fontSize: 13 }}>{emptyLabel}</div>;
  }

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => setCollapsedLevel(true)} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Collapse all
          </button>
          <button onClick={() => setCollapsedLevel(false)} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Expand all
          </button>
        </div>
        <div data-testid="workflow-inspector-json-copy-hint" style={{ fontSize: 12, opacity: 0.65 }}>
          {copyState === "copied" ? "Copied to clipboard" : "Use the copy icon in the viewer"}
        </div>
      </div>
      <div data-testid="workflow-inspector-json-panel" style={{ minWidth: 0, overflowX: "hidden", overflowY: "auto", border: "1px solid #d1d5db", background: "#f8fafc", padding: 12 }}>
        {isRenderableJson ? (
          <div style={{ minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>
            <JsonView
              value={value as object}
              collapsed={collapsedLevel}
              enableClipboard
              displayDataTypes={false}
              displayObjectSize
              shortenTextAfterLength={0}
              style={{
                ...githubLightTheme,
                backgroundColor: "transparent",
                padding: 0,
                fontSize: 12,
                lineHeight: 1.6,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
              onCopied={() => {
                setCopyState("copied");
                window.setTimeout(() => setCopyState("idle"), 1500);
              }}
              onExpand={() => {
                if (copyState === "copied") setCopyState("idle");
              }}
            />
          </div>
        ) : (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", fontSize: 12, lineHeight: 1.6, color: "#111827", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
