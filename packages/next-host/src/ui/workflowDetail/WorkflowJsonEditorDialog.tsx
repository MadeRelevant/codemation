import Editor from "@monaco-editor/react";
import { useEffect,useState } from "react";
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
      data-testid="workflow-json-editor-dialog"
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
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
              {state.mode === "pin-output"
                ? "Provide valid JSON. Saving here pins this node output. Then use Run on the canvas to continue."
                : "Provide valid JSON. Objects become one item; arrays become multiple items."}
            </div>
          </div>
          <button onClick={onClose} style={{ border: "1px solid #d1d5db", background: "white", padding: "8px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Close
          </button>
        </div>
        <div style={{ padding: 16, minHeight: 0, position: "relative" }}>
          <div
            style={{
              height: "100%",
              border: "1px solid #d1d5db",
              background: "#ffffff",
              overflow: "hidden",
            }}
          >
            <Editor
              height="100%"
              language="json"
              path={`${state.mode}.json`}
              value={value}
              onChange={(nextValue) => {
                setValue(nextValue ?? "");
                if (error) setError(null);
              }}
              loading={<div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 12, color: "#64748b" }}>Loading editor…</div>}
              options={{
                automaticLayout: true,
                formatOnPaste: true,
                formatOnType: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbersMinChars: 3,
                tabSize: 2,
                insertSpaces: true,
                wordWrap: "on",
                bracketPairColorization: {
                  enabled: true,
                },
                guides: {
                  indentation: true,
                  bracketPairs: true,
                },
                padding: {
                  top: 12,
                  bottom: 12,
                },
              }}
            />
          </div>
          <textarea
            data-testid="workflow-json-editor-input"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            spellCheck={false}
            style={{
              position: "absolute",
              opacity: 0,
              pointerEvents: "none",
              width: 1,
              height: 1,
              inset: 0,
            }}
            aria-hidden="true"
            tabIndex={-1}
          />
          {error ? <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
        </div>
        <div style={{ padding: 16, borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ border: "1px solid #d1d5db", background: "white", padding: "8px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Cancel
          </button>
          <button
            data-testid="workflow-json-editor-save"
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
