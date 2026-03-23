"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WorkflowJsonEditorBinaryUploadRow(args: Readonly<{
  itemIndex: number;
  suggestName: string;
  busyKey: string | null;
  onUpload: (file: File, attachmentName: string) => void;
}>): ReactNode {
  const { itemIndex, suggestName, busyKey, onUpload } = args;
  const [name, setName] = useState(suggestName);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const nameFieldId = `workflow-json-editor-binary-name-${itemIndex}`;
  useEffect(() => {
    setName(suggestName);
  }, [suggestName]);
  const disabled = busyKey !== null || !name.trim();
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
      <div className="flex min-w-[120px] flex-1 flex-col gap-1.5">
        <Label htmlFor={nameFieldId} className="text-[11px] font-bold text-muted-foreground">
          Attachment name
        </Label>
        <Input
          id={nameFieldId}
          className="h-8 text-xs"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          data-testid={`workflow-json-editor-binary-name-${itemIndex}`}
        />
      </div>
      <Input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        data-testid={`workflow-json-editor-binary-upload-${itemIndex}`}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && name.trim()) {
            onUpload(file, name.trim());
          }
        }}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 text-[11px] font-bold"
        disabled={disabled}
        onClick={() => {
          uploadInputRef.current?.click();
        }}
      >
        Upload
      </Button>
    </div>
  );
}
