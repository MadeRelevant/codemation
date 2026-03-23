"use client";

import Editor from "@monaco-editor/react";
import type { ComponentProps } from "react";

import { Textarea } from "@/components/ui/textarea";

const defaultOptions: NonNullable<ComponentProps<typeof Editor>["options"]> = {
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
};

/**
 * Monaco-based JSON editor with a mirrored, visually hidden `<textarea>` that carries the same value.
 * Tests and automation can drive `data-testid` on that textarea because Monaco’s surface is not a reliable
 * DOM target for `fireEvent.change` / user typing simulation.
 */
export function JsonMonacoEditor(args: Readonly<{
  path: string;
  value: string;
  onChange: (value: string | undefined) => void;
  /** Shown below the editor region when set. */
  error?: string | null;
  /** Passed to the hidden textarea for stable test selectors. */
  testId?: string;
}>) {
  const { path, value, onChange, error, testId = "workflow-json-editor-input" } = args;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="h-[min(60vh,560px)] min-h-[200px] shrink-0 overflow-hidden rounded-md border border-border bg-background">
        <Editor
          height="100%"
          language="json"
          path={path}
          value={value}
          onChange={onChange}
          loading={
            <div className="grid h-full place-items-center text-xs text-muted-foreground">Loading editor…</div>
          }
          options={defaultOptions}
        />
      </div>
      <Textarea
        data-testid={testId}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        spellCheck={false}
        className="pointer-events-none absolute inset-0 h-px w-px min-h-0 resize-none border-0 p-0 opacity-0"
        aria-hidden="true"
        tabIndex={-1}
      />
      {error ? <div className="mt-1 text-xs text-destructive">{error}</div> : null}
    </div>
  );
}
