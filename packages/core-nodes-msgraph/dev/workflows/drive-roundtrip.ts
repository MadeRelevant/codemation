/**
 * Demo: resolve a drive folder, upload a file to it, download it back.
 *
 * TESTING TECHNIQUE — read this before running:
 *   1. Manual trigger emits a JSON payload of test inputs (folderPath, uploadName,
 *      uploadContent). These are the defaults; you can change them without code edits.
 *   2. Pin the trigger output in the UI to reuse those values across runs without
 *      touching the workflow definition. Just click the trigger node, enable "Pin
 *      output", adjust the JSON, then hit "Run now".
 *   3. The drive nodes fall back to `item.json.driveId` / `item.json.itemId` when
 *      their cfg fields are empty. So DriveResolve's output flows naturally into
 *      DriveUpload, and DriveUpload's output flows into DriveDownload — no UI
 *      expression wiring required.
 *
 * Listing folder children has its own demo workflow (drive-list-children.ts).
 *
 * Requires a Microsoft Graph Drive (OAuth) credential bound to each msgraph node's
 * `auth` slot.
 */
import { Callback, ManualTrigger, createWorkflowBuilder } from "@codemation/core-nodes";
import {
  driveDownloadNode,
  driveResolveNode,
  driveUploadNode,
  type DriveDownloadOutput,
  type DriveResolveOutput,
  type DriveUploadOutput,
} from "../../src/index";

type TriggerPayload = Readonly<{
  folderPath: string;
  uploadName: string;
  uploadContent: string;
}>;

type UploadSummary = Readonly<{
  driveId: string;
  uploadedItemId: string;
  uploadedName: string;
  size?: number;
}>;

type RoundTripSummary = Readonly<{
  uploadedName: string;
  sizeUp?: number;
  sizeDown?: number;
  binarySlot: string;
}>;

const BINARY_SLOT = "demo-upload";

export default createWorkflowBuilder({
  id: "wf.msgraph.drive.roundtrip-demo",
  name: "MS Graph — Drive upload & download roundtrip",
})
  .trigger(
    new ManualTrigger<TriggerPayload>(
      "Manual trigger",
      {
        folderPath: "/",
        uploadName: "codemation-demo.txt",
        uploadContent: "Hello from Codemation",
      },
      "msgraph_drive_manual",
    ),
  )
  .then(
    driveResolveNode.create(
      {
        // Default: drive root (/). Change in the UI without code edits.
        input: { kind: "personalPath", path: "/" },
      },
      "Resolve folder path",
      "msgraph_drive_resolve_folder",
    ),
  )
  // Attach upload bytes to ctx.binary while preserving DriveResolve's { driveId, itemId }
  // on item.json so DriveUpload's fallback can pick them up.
  .then(
    new Callback<DriveResolveOutput, DriveResolveOutput>("Attach upload content", async (items, ctx) => {
      return Promise.all(
        items.map(async (item) => {
          const content = Buffer.from(`Hello from Codemation\nGenerated at ${new Date().toISOString()}\n`);
          const stored = await ctx.binary.attach({
            name: BINARY_SLOT,
            body: content,
            mimeType: "text/plain",
            filename: "codemation-demo.txt",
          });
          const withBinary = ctx.binary.withAttachment(item, BINARY_SLOT, stored);
          return { ...withBinary, json: item.json };
        }),
      );
    }),
  )
  .then(
    driveUploadNode.create(
      {
        // Empty cfg ids → node falls back to item.json.{driveId, itemId} (the resolved folder).
        driveId: "",
        parentItemId: "",
        name: "codemation-demo.txt",
        binarySlot: BINARY_SLOT,
        conflictBehavior: "replace",
      },
      "Upload to OneDrive",
      "msgraph_drive_upload",
    ),
  )
  .then(
    new Callback<DriveUploadOutput, UploadSummary>("Log upload result", (items) =>
      items.map((item) => ({
        ...item,
        json: {
          driveId: item.json.driveId,
          uploadedItemId: item.json.itemId,
          uploadedName: item.json.name,
          size: item.json.size,
        } satisfies UploadSummary,
      })),
    ),
  )
  // DriveDownload's fallback reads driveId+itemId from item.json. UploadSummary uses
  // `uploadedItemId` though, so map back to `itemId` for the fallback to find it.
  .then(
    new Callback<UploadSummary, { driveId: string; itemId: string; uploadedName: string; size?: number }>(
      "Prep download input",
      (items) =>
        items.map((item) => ({
          ...item,
          json: {
            driveId: item.json.driveId,
            itemId: item.json.uploadedItemId,
            uploadedName: item.json.uploadedName,
            size: item.json.size,
          },
        })),
    ),
  )
  .then(
    driveDownloadNode.create(
      {
        driveId: "",
        itemId: "",
        sizeCapBytes: 1 * 1024 * 1024,
      },
      "Download from OneDrive",
      "msgraph_drive_download",
    ),
  )
  .then(
    new Callback<DriveDownloadOutput, RoundTripSummary>("Summarize round-trip", (items) =>
      items.map((item) => ({
        ...item,
        json: {
          uploadedName: item.json.name,
          sizeUp: item.json.size,
          sizeDown: item.json.size,
          binarySlot: item.json.name,
        } satisfies RoundTripSummary,
      })),
    ),
  )
  .build();
