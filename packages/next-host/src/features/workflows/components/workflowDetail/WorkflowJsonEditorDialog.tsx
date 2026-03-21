"use client";

import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";

import { CodemationDialog } from "@/components/CodemationDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    <CodemationDialog
      onClose={onClose}
      testId="workflow-json-editor-dialog"
      size="full"
      showCloseButton={false}
      contentClassName="max-h-[min(90vh,800px)] w-[min(960px,100%)]"
    >
      <CodemationDialog.Title className="font-normal">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-extrabold">{state.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {state.mode === "pin-output"
                ? "Provide valid JSON. Saving here pins this node output. Then use Run on the canvas to continue."
                : "Provide valid JSON. Objects become one item; arrays become multiple items."}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs font-bold" onClick={onClose}>
            Close
          </Button>
        </div>
      </CodemationDialog.Title>
      <CodemationDialog.Content className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="h-[min(60vh,560px)] min-h-[200px] shrink-0 overflow-hidden rounded-md border border-border bg-background">
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
          <Textarea
            data-testid="workflow-json-editor-input"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            spellCheck={false}
            className="pointer-events-none absolute inset-0 h-px w-px min-h-0 resize-none border-0 p-0 opacity-0"
            aria-hidden="true"
            tabIndex={-1}
          />
          {error ? <div className="mt-1 text-xs text-destructive">{error}</div> : null}
        </div>
      </CodemationDialog.Content>
      <CodemationDialog.Actions>
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
      </CodemationDialog.Actions>
    </CodemationDialog>
  );
}
