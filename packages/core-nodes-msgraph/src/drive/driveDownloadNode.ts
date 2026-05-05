import type {
  CredentialRequirement,
  Item,
  NodeBinaryAttachmentService,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
} from "@codemation/core";
import { node } from "@codemation/core";
import { z } from "zod";
import { MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphDriveOAuth";
import { createGraphClient, type MsGraphSession } from "../credentials/session";
import { withGraphRetry } from "../lib/graphRetry";
import type { RawChildItem } from "./driveItemMapper";

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

const DEFAULT_SIZE_CAP_BYTES = 100 * 1024 * 1024; // 100 MiB

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

export const DriveDownloadInputSchema = z.object({
  /** Canonical drive id. */
  driveId: z.string().min(1),
  /** Canonical item id. */
  itemId: z.string().min(1),
  /**
   * Maximum file size in bytes. Files larger than this will cause the node to
   * throw with a clear error including both the actual size and the cap.
   * Default: 100 MiB.
   */
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

/**
 * Sanitize a file name for use as a binary slot identifier.
 * Removes characters that are invalid in binary slot names.
 */
function sanitizeSlotName(name: string): string {
  // Replace slashes and control chars; collapse runs of spaces/dots; trim.
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
// Config
// ---------------------------------------------------------------------------

export type DriveDownloadOptions = Readonly<{
  driveId: string;
  itemId: string;
  sizeCapBytes?: number;
}>;

export class DriveDownload implements RunnableNodeConfig<DriveDownloadOptions, DriveDownloadOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = DriveDownloadNode;
  readonly icon = "builtin:microsoft-onedrive" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: DriveDownloadOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const hasItem = this.cfg.itemId?.trim();
    const sizeCap = this.cfg.sizeCapBytes;
    const capPart =
      sizeCap !== undefined && sizeCap !== DEFAULT_SIZE_CAP_BYTES
        ? ` (cap: ${Math.round(sizeCap / 1024 / 1024)} MiB)`
        : "";
    return hasItem
      ? `Download \`${hasItem}\` to binary slot${capPart}.`
      : `Download drive item to binary slot (driveId + itemId from upstream)${capPart}.`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential covering Files.Read.All.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class DriveDownloadNode implements RunnableNode<DriveDownload> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  readonly #downloadHttp: DownloadHttp;

  constructor(downloadHttp?: DownloadHttp) {
    this.#downloadHttp = downloadHttp ?? makeProductionDownloadHttp();
  }

  async execute(args: RunnableNodeExecuteArgs<DriveDownload>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");
    const metadataClient = createGraphClient(session) as unknown as GraphClient;
    const binary = ctx.binary as NodeBinaryAttachmentService;

    // Fall back to item.json so DriveUpload → DriveDownload chains without UI wiring.
    const fromItem = (args.item.json ?? {}) as { driveId?: string; itemId?: string };
    const input = DriveDownloadInputSchema.parse({
      driveId: cfg.driveId || fromItem.driveId,
      itemId: cfg.itemId || fromItem.itemId,
      sizeCapBytes: cfg.sizeCapBytes,
    });

    const result = await downloadItem({
      metadataClient,
      downloadHttp: this.#downloadHttp,
      session,
      input,
      binary,
      item: args.item as Item,
    });

    return result;
  }
}
