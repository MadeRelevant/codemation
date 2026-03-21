"use client";

import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { JsonEditorState } from "../../lib/workflowDetail/workflowDetailTypes";

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
      className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-6"
    >
      <div className="grid h-[min(80vh,760px)] w-[min(960px,100%)] grid-rows-[auto_1fr_auto] border border-border bg-card shadow-2xl ring-1 ring-foreground/10">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <div className="text-[15px] font-extrabold">{state.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {state.mode === "pin-output"
                ? "Provide valid JSON. Saving here pins this node output. Then use Run on the canvas to continue."
                : "Provide valid JSON. Objects become one item; arrays become multiple items."}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="text-xs font-bold" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="relative min-h-0 p-4">
          <div className="h-full overflow-hidden border border-border bg-background">
            <Editor
              height="100%"
              language="json"
              path={`${state.mode}.json`}
              value={value}
              onChange={(nextValue) => {
                setValue(nextValue ?? "");
                if (error) setError(null);
              }}
              loading={
                <div className="grid h-full place-items-center text-xs text-muted-foreground">Loading editor…</div>
              }
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
            className="pointer-events-none absolute inset-0 h-px w-px opacity-0"
            aria-hidden="true"
            tabIndex={-1}
          />
          {error ? <div className="mt-2.5 text-xs text-destructive">{error}</div> : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border p-4">
          <Button type="button" variant="outline" size="sm" className="text-xs font-bold" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="workflow-json-editor-save"
            size="sm"
            className="text-xs font-extrabold"
            onClick={() => {
              try {
                JSON.parse(value);
                onSave(value);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
              }
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
