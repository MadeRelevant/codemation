"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CodemationDialog } from "@/components/CodemationDialog";
import { JsonMonacoEditor } from "@/components/json/JsonMonacoEditor";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowDetailPresenter } from "../../lib/workflowDetail/WorkflowDetailPresenter";
import type { JsonEditorState, PinBinaryMapsByItemIndex } from "../../lib/workflowDetail/workflowDetailTypes";
import { WorkflowJsonEditorBinaryAttachmentRow } from "./WorkflowJsonEditorBinaryAttachmentRow";
import { WorkflowJsonEditorBinaryUploadRow } from "./WorkflowJsonEditorBinaryUploadRow";

export function WorkflowJsonEditorDialog(
  args: Readonly<{
    state: JsonEditorState;
    onClose: () => void;
    onSave: (value: string, binaryMaps?: PinBinaryMapsByItemIndex) => void;
    /** Initial tab when `state.mode === "pin-output"` (defaults to `json`). */
    initialEditorTab?: "json" | "binaries";
  }>,
) {
  const { state, onClose, onSave, initialEditorTab } = args;
  const [value, setValue] = useState(state.value);
  const [error, setError] = useState<string | null>(null);
  const [binaryMaps, setBinaryMaps] = useState<PinBinaryMapsByItemIndex>(() =>
    state.mode === "pin-output" ? state.binaryMapsByItemIndex : [],
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusyKey, setUploadBusyKey] = useState<string | null>(null);

  useEffect(() => {
    setValue(state.value);
    setError(null);
    setUploadError(null);
    if (state.mode === "pin-output") {
      setBinaryMaps(state.binaryMapsByItemIndex);
    }
  }, [state]);

  const itemCount = useMemo(() => {
    try {
      return WorkflowDetailPresenter.parseEditableItems(value).length;
    } catch {
      return 0;
    }
  }, [value]);

  const handleJsonChange = useCallback(
    (nextValue: string | undefined) => {
      const next = nextValue ?? "";
      setValue(next);
      if (error) setError(null);
      if (state.mode !== "pin-output") {
        return;
      }
      try {
        const parsed = WorkflowDetailPresenter.parseEditableItems(next);
        setBinaryMaps((prev) => WorkflowDetailPresenter.reindexBinaryMapsForItemCount(prev, parsed.length));
      } catch {
        // Invalid JSON: keep binary maps until the JSON becomes valid again.
      }
    },
    [error, state.mode],
  );

  const suggestAttachmentName = useCallback((existing: Readonly<Record<string, unknown>>): string => {
    if (!existing.file) return "file";
    let n = 1;
    while (existing[`file_${n}`]) {
      n += 1;
    }
    return `file_${n}`;
  }, []);

  const handleUploadOrReplace = useCallback(
    async (itemIndex: number, file: File, attachmentName: string) => {
      if (state.mode !== "pin-output") {
        return;
      }
      const key = `${itemIndex}:${attachmentName}`;
      setUploadError(null);
      setUploadBusyKey(key);
      try {
        const attachment = await WorkflowDetailPresenter.uploadOverlayPinnedBinary({
          workflowId: state.workflowId,
          nodeId: state.nodeId,
          itemIndex,
          attachmentName,
          file,
        });
        setBinaryMaps((prev) => {
          const next = prev.map((row) => ({ ...row }));
          while (next.length <= itemIndex) {
            next.push({});
          }
          next[itemIndex] = { ...next[itemIndex], [attachmentName]: attachment };
          return next;
        });
      } catch (cause: unknown) {
        setUploadError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setUploadBusyKey(null);
      }
    },
    [state],
  );

  const handleRemove = useCallback((itemIndex: number, attachmentName: string) => {
    setBinaryMaps((prev) => {
      const next = prev.map((row, i) => {
        if (i !== itemIndex) {
          return { ...row };
        }
        const copy = { ...row };
        delete copy[attachmentName];
        return copy;
      });
      return next;
    });
  }, []);

  const runSave = useCallback(() => {
    try {
      if (state.mode === "pin-output") {
        const normalized = WorkflowDetailPresenter.formatPinOutputJsonForSubmit(value);
        onSave(normalized, binaryMaps);
        return;
      }
      JSON.parse(value);
      onSave(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [binaryMaps, onSave, state.mode, value]);

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
                ? "Edit a top-level JSON array of output items (one element per item; Binaries uses the same indices). The engine always uses this shape. Save to pin the node output, then use Run on the canvas to continue."
                : "Provide valid JSON. Objects become one item; arrays become multiple items."}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs font-bold" onClick={onClose}>
            Close
          </Button>
        </div>
      </CodemationDialog.Title>
      <CodemationDialog.Content className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
        {state.mode === "pin-output" ? (
          <Tabs defaultValue={initialEditorTab ?? "json"} className="flex min-h-0 flex-1 flex-col gap-2">
            <TabsList variant="line" className="w-full shrink-0 justify-start">
              <TabsTrigger value="json" className="text-xs font-bold">
                JSON
              </TabsTrigger>
              <TabsTrigger
                value="binaries"
                className="text-xs font-bold"
                data-testid="workflow-json-editor-binaries-tab"
              >
                Binaries
              </TabsTrigger>
            </TabsList>
            <TabsContent value="json" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              <JsonMonacoEditor path={`${state.mode}.json`} value={value} onChange={handleJsonChange} error={error} />
            </TabsContent>
            <TabsContent value="binaries" className="mt-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
              <div className="flex flex-col gap-4 pb-2">
                {itemCount === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Fix JSON on the JSON tab so at least one item exists.
                  </div>
                ) : null}
                {state.mode === "pin-output"
                  ? Array.from({ length: itemCount }, (_, itemIndex) => {
                      const row = binaryMaps[itemIndex] ?? {};
                      const entries = Object.entries(row);
                      const workflowId = state.workflowId;
                      return (
                        <div
                          key={itemIndex}
                          className="rounded-md border border-border bg-muted/30 p-3"
                          data-testid={`workflow-json-editor-binaries-item-${itemIndex}`}
                        >
                          <div className="text-xs font-extrabold">Item {itemIndex}</div>
                          <div className="mt-2 flex flex-col gap-2">
                            {entries.length === 0 ? (
                              <div className="text-xs text-muted-foreground">No attachments for this item.</div>
                            ) : null}
                            {entries.map(([name, attachment]) => (
                              <WorkflowJsonEditorBinaryAttachmentRow
                                key={`${itemIndex}:${name}:${attachment.id}`}
                                workflowId={workflowId}
                                itemIndex={itemIndex}
                                name={name}
                                attachment={attachment}
                                uploadBusyKey={uploadBusyKey}
                                onReplace={(file) => {
                                  void handleUploadOrReplace(itemIndex, file, name);
                                }}
                                onRemove={() => {
                                  handleRemove(itemIndex, name);
                                }}
                              />
                            ))}
                            <WorkflowJsonEditorBinaryUploadRow
                              itemIndex={itemIndex}
                              suggestName={suggestAttachmentName(row)}
                              busyKey={uploadBusyKey}
                              onUpload={(file, attachmentName) => {
                                void handleUploadOrReplace(itemIndex, file, attachmentName);
                              }}
                            />
                          </div>
                        </div>
                      );
                    })
                  : null}
                {uploadError ? <div className="text-xs text-destructive">{uploadError}</div> : null}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <JsonMonacoEditor path={`${state.mode}.json`} value={value} onChange={handleJsonChange} error={error} />
        )}
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
          onClick={runSave}
        >
          Save
        </Button>
      </CodemationDialog.Actions>
    </CodemationDialog>
  );
}
