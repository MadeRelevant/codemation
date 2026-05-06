import { defineNode } from "@codemation/core";
import type { Item, NodeBinaryAttachmentService } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import { createGraphClient } from "../credentials/session";
import type { MsGraphSession } from "../credentials/session";
import { withGraphRetry } from "../lib/graphRetry";
import type { RawChildItem } from "./driveItemMapper";

// ---------------------------------------------------------------------------
// Narrow GraphClient interface for testability
// ---------------------------------------------------------------------------

type GraphApiRequest = {
  get(): Promise<unknown>;
  getStream(): Promise<NodeJS.ReadableStream>;
};

export type GraphClient = {
  api(url: string): GraphApiRequest;
};

// ---------------------------------------------------------------------------
// Isolated HTTP interface — allows test stubbing without touching the real SDK
// ---------------------------------------------------------------------------

/**
 * Minimal interface isolating the Graph binary-download HTTP call.
 * Production: backed by the Graph SDK's `.getStream()`.
 * Tests: inject a stub that returns a Buffer without network I/O.
 */
export type DownloadHttp = {
  downloadContent(args: {
    driveId: string;
    itemId: string;
    session: MsGraphSession;
  }): Promise<{ body: Buffer; mimeType?: string }>;
};

/**
 * Production implementation of DownloadHttp.
 * Uses the Graph SDK client's `.getStream()` which follows the Graph 302 redirect
 * to the pre-authenticated download URL transparently.
 */
export function makeProductionDownloadHttp(): DownloadHttp {
  return {
    async downloadContent({ driveId, itemId, session }) {
      const client = createGraphClient(session) as unknown as GraphClient;
      const url = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`;

      const stream = (await withGraphRetry(() => client.api(url).getStream())) as unknown;

      // Graph SDK 3.x returns either a Node.js Readable or a Web ReadableStream depending on
      // the runtime. Handle both — the Web case turned up in our local dev (Node 20+).
      const chunks: Buffer[] = [];
      if (stream && typeof (stream as NodeJS.ReadableStream).on === "function") {
        await new Promise<void>((resolve, reject) => {
          const s = stream as NodeJS.ReadableStream;
          s.on("data", (chunk: Buffer | Uint8Array) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          s.on("end", () => resolve());
          s.on("error", reject);
        });
      } else if (stream && typeof (stream as ReadableStream<Uint8Array>).getReader === "function") {
        const reader = (stream as ReadableStream<Uint8Array>).getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(Buffer.from(value));
        }
      } else {
        throw new Error("DriveDownload: unexpected stream type returned by Graph client.getStream()");
      }

      return { body: Buffer.concat(chunks) };
    },
  };
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const DEFAULT_SIZE_CAP_BYTES = 100 * 1024 * 1024; // 100 MiB

export const DriveDownloadInputSchema = z.object({
  driveId: z.string().min(1),
  itemId: z.string().min(1),
  sizeCapBytes: z.number().int().min(1).default(DEFAULT_SIZE_CAP_BYTES),
});

export type DriveDownloadInput = z.infer<typeof DriveDownloadInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type DriveDownloadOutput = {
  driveId: string;
  itemId: string;
  name: string;
  mimeType?: string;
  size?: number;
};

// ---------------------------------------------------------------------------
// Slot name sanitizer
// ---------------------------------------------------------------------------

function sanitizeSlotName(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "download"
  );
}

// ---------------------------------------------------------------------------
// Core download function (exported for testing)
// ---------------------------------------------------------------------------

export async function downloadItem(args: {
  metadataClient: GraphClient;
  downloadHttp: DownloadHttp;
  session: MsGraphSession;
  input: DriveDownloadInput;
  binary: NodeBinaryAttachmentService;
  item: Item;
}): Promise<Item<DriveDownloadOutput>> {
  const { metadataClient, downloadHttp, session, input, binary, item } = args;
  const { driveId, itemId, sizeCapBytes } = input;

  // Step 1: fetch metadata to get size, name, mimeType before downloading bytes
  const metaUrl = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`;
  const meta = (await withGraphRetry(() => metadataClient.api(metaUrl).get())) as RawChildItem;

  const name = meta.name ?? itemId;
  const mimeType = meta.file?.mimeType;
  const size = meta.size;

  if (size !== undefined && size > sizeCapBytes) {
    throw new Error(
      `DriveDownloadNode: file "${name}" is ${size} bytes, which exceeds the size cap of ${sizeCapBytes} bytes. ` +
        "Increase sizeCapBytes or use a different approach for large files.",
    );
  }

  // Step 2: download the content bytes
  const { body } = await downloadHttp.downloadContent({ driveId, itemId, session });

  // Step 3: attach bytes via binary service (NEVER put bytes on item JSON)
  const slot = sanitizeSlotName(name);
  const stored = await binary.attach({
    name: slot,
    body,
    mimeType: mimeType ?? "application/octet-stream",
    filename: name,
  });

  // Step 4: build output — pass-through metadata only; bytes are in binary slot
  const output: DriveDownloadOutput = { driveId, itemId, name, mimeType, size };
  const resultItem: Item<DriveDownloadOutput> = binary.withAttachment({ ...item, json: output }, slot, stored);

  return resultItem;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DriveDownloadOptions = Readonly<{
  driveId: string;
  itemId: string;
  sizeCapBytes?: number;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const driveDownloadNode = defineNode({
  key: "msgraph-drive.download",
  title: "Download drive item",
  description: "Download a drive item's content to a binary slot (never on JSON). Falls back to item.json ids.",
  icon: "builtin:microsoft-onedrive",
  keepBinaries: true,
  credentials: {
    auth: {
      type: msGraphDriveOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential covering Files.Read.All.",
    },
  },
  async execute({ item }, { config, credentials, execution }) {
    const session = (await credentials.auth()) as MsGraphSession;
    const metadataClient = createGraphClient(session) as unknown as GraphClient;
    const binary = execution.binary as NodeBinaryAttachmentService;

    // Fall back to item.json so DriveUpload → DriveDownload chains without UI wiring.
    const fromItem = (item.json ?? {}) as { driveId?: string; itemId?: string };
    const input = DriveDownloadInputSchema.parse({
      driveId: config.driveId || fromItem.driveId,
      itemId: config.itemId || fromItem.itemId,
      sizeCapBytes: config.sizeCapBytes,
    });

    const result = await downloadItem({
      metadataClient,
      downloadHttp: makeProductionDownloadHttp(),
      session,
      input,
      binary,
      item: item as Item,
    });

    return result.json;
  },
});
