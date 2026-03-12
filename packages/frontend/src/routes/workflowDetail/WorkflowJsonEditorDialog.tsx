import { useEffect, useState } from "react";
import type { JsonEditorState } from "./workflowDetailTypes";

export function WorkflowJsonEditorDialog(args: Readonly<{
  state: JsonEditorState;
  onClose: () => void;
  onSave: (value: string) => void;
}>) {
  const { state, onClose, onSave } = args;
  const [value, setValue] = useState(state.value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(state.value);
    setError(null);
  }, [state]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.48)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div style={{ width: "min(960px, 100%)", height: "min(80vh, 760px)", background: "white", border: "1px solid #cbd5e1", display: "grid", gridTemplateRows: "auto 1fr auto", boxShadow: "0 25px 50px rgba(15,23,42,0.2)" }}>
        <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{state.title}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>Provide valid JSON. Objects become one item; arrays become multiple items.</div>
          </div>
          <button onClick={onClose} style={{ border: "1px solid #d1d5db", background: "white", padding: "8px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Close
          </button>
        </div>
        <div style={{ padding: 16, minHeight: 0 }}>
          <textarea
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            spellCheck={false}
            style={{
              width: "100%",
              height: "100%",
              resize: "none",
              border: "1px solid #d1d5db",
              padding: 12,
              fontSize: 12,
              lineHeight: 1.6,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          />
          {error ? <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
        </div>
        <div style={{ padding: 16, borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ border: "1px solid #d1d5db", background: "white", padding: "8px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Cancel
          </button>
          <button
            onClick={() => {
              try {
                JSON.parse(value);
                onSave(value);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              }
            }}
            style={{ border: "1px solid #111827", background: "#111827", color: "white", padding: "8px 12px", cursor: "pointer", fontWeight: 800, fontSize: 12 }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
