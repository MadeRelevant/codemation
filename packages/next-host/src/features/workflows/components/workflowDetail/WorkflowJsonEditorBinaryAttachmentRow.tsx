"use client";

import type { BinaryAttachment } from "@codemation/core/browser";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";
import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WorkflowJsonEditorBinaryAttachmentRow(args: Readonly<{
  workflowId: string;
  itemIndex: number;
  name: string;
  attachment: BinaryAttachment;
  uploadBusyKey: string | null;
  onReplace: (file: File) => void;
  onRemove: () => void;
}>): ReactNode {
  const { workflowId, itemIndex, name, attachment, uploadBusyKey, onReplace, onRemove } = args;
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded border border-border/60 bg-background px-2 py-1.5"
      data-testid={`workflow-json-editor-binary-row-${itemIndex}-${name}`}
    >
      <span className="text-xs font-bold">{name}</span>
      <a
        className="text-xs font-medium text-primary underline"
        href={ApiPaths.workflowOverlayBinaryContent(workflowId, attachment.id)}
        target="_blank"
        rel="noreferrer"
      >
        Open
      </a>
      <Input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        data-testid={`workflow-json-editor-binary-replace-${itemIndex}-${name}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            onReplace(file);
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-[11px] font-bold"
        disabled={uploadBusyKey !== null}
        onClick={() => {
          replaceInputRef.current?.click();
        }}
      >
        Replace
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-[11px] font-bold text-destructive"
        data-testid={`workflow-json-editor-binary-remove-${itemIndex}-${name}`}
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
}
