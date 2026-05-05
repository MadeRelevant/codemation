import type {
  BinaryAttachment,
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
import { MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphOAuth";
import { createGraphClient, type MsGraphSession } from "../credentials/session";
import { withGraphRetry } from "../lib/graphRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Files at or below this threshold use a simple PUT. */
const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024; // 4 MiB

/**
 * Chunk size for large-file upload sessions.
 * Must be a multiple of 320 KiB per Graph API requirements.
 * 5 × 320 KiB = 1.6 MiB is a reasonable starting point.
 */
const CHUNK_SIZE_BYTES = 5 * 320 * 1024; // 1,638,400 bytes

// ---------------------------------------------------------------------------
// Narrow GraphClient interface for testability
// ---------------------------------------------------------------------------

type GraphApiRequest = {
  put(body: unknown): Promise<unknown>;
  post(body: unknown): Promise<unknown>;
};

export type GraphClient = {
  api(url: string): GraphApiRequest;
};

// ---------------------------------------------------------------------------
// Raw Graph response shapes
// ---------------------------------------------------------------------------

type RawUploadedDriveItem = {
  id?: string;
  name?: string;
  webUrl?: string;
  size?: number;
  file?: { mimeType?: string };
  parentReference?: { driveId?: string };
};

// ---------------------------------------------------------------------------
// Isolated HTTP interface — allows test stubbing without touching the real SDK
// ---------------------------------------------------------------------------

export type UploadSessionResponse = {
  uploadUrl: string;
};

export type ChunkUploadResult = {
  /** HTTP status returned by Graph for this chunk (202 = in progress, 200/201 = complete). */
  status: number;
  /** Present on the final chunk (status 200 or 201). */
  item?: RawUploadedDriveItem;
};

/**
 * Minimal interface isolating the Graph upload HTTP calls.
 * Production: backed by the Graph SDK.
 * Tests: inject a stub without network I/O.
 */
export type UploadHttp = {
  uploadSimple(args: {
    driveId: string;
    parentItemId: string;
    name: string;
    body: Buffer;
    mimeType: string;
    conflictBehavior: string;
    session: MsGraphSession;
  }): Promise<RawUploadedDriveItem>;

  createUploadSession(args: {
    driveId: string;
    parentItemId: string;
    name: string;
    conflictBehavior: string;
    session: MsGraphSession;
  }): Promise<UploadSessionResponse>;

  uploadChunk(args: {
    uploadUrl: string;
    chunk: Buffer;
    rangeStart: number;
    rangeEnd: number;
    total: number;
  }): Promise<ChunkUploadResult>;
};

/**
 * Production implementation of UploadHttp backed by the Graph SDK and fetch.
 *
 * Note: chunk PUTs go to the pre-authenticated `uploadUrl` — the bearer token
 * must NOT be sent on those requests (Graph rejects it). Only createUploadSession
 * needs the bearer, via the SDK client.
 */
function makeProductionUploadHttp(): UploadHttp {
  return {
    async uploadSimple({ driveId, parentItemId, name, body, mimeType, conflictBehavior, session }) {
      const url =
        `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(name)}:/content` +
        `?@microsoft.graph.conflictBehavior=${encodeURIComponent(conflictBehavior)}`;

      const result = await withGraphRetry(async () => {
        // We need to set Content-Type; use fetch directly since SDK .put() may not support it cleanly
        const accessToken = await session.refresh();
        const response = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": mimeType,
          },
          // Buffer is a Uint8Array subclass but fetch's BodyInit type doesn't always
          // accept it directly in strict TS environments — use Uint8Array explicitly.
          body: new Uint8Array(body),
        });
        if (!response.ok) {
          const err = Object.assign(new Error(`Graph PUT failed: ${response.status}`), {
            statusCode: response.status,
          });
          throw err;
        }
        return (await response.json()) as RawUploadedDriveItem;
      });

      return result;
    },

    async createUploadSession({ driveId, parentItemId, name, conflictBehavior, session }) {
      const client = createGraphClient(session) as unknown as GraphClient;
      const url = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(name)}:/createUploadSession`;

      const result = await withGraphRetry(() =>
        client.api(url).post({
          item: {
            "@microsoft.graph.conflictBehavior": conflictBehavior,
            name,
          },
        }),
      );

      return result as UploadSessionResponse;
    },

    async uploadChunk({ uploadUrl, chunk, rangeStart, rangeEnd, total }) {
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${rangeStart}-${rangeEnd}/${total}`,
          // NOTE: Do NOT include Authorization header — uploadUrl is pre-authenticated.
        },
        body: new Uint8Array(chunk),
      });

      if (!response.ok && response.status !== 202) {
        const err = Object.assign(new Error(`Graph chunk upload failed: ${response.status}`), {
          statusCode: response.status,
        });
        throw err;
      }

      const status = response.status;
      if (status === 200 || status === 201) {
        const item = (await response.json()) as RawUploadedDriveItem;
        return { status, item };
      }

      return { status };
    },
  };
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const CONFLICT_BEHAVIORS = ["replace", "rename", "fail"] as const;
type ConflictBehavior = (typeof CONFLICT_BEHAVIORS)[number];

export const DriveUploadInputSchema = z.object({
  /** Canonical drive id. */
  driveId: z.string().min(1),
  /** Canonical item id of the parent folder to upload into. */
  parentItemId: z.string().min(1),
  /** Filename to use in OneDrive/SharePoint. */
  name: z.string().min(1),
  /** Name of the binary slot on the incoming item that carries the file bytes. */
  binarySlot: z.string().min(1),
  /** How to handle a name collision. Default: "replace". */
  conflictBehavior: z.enum(CONFLICT_BEHAVIORS).default("replace"),
});

export type DriveUploadInput = z.infer<typeof DriveUploadInputSchema>;

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type DriveUploadOutput = {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
  mimeType?: string;
  size?: number;
};

// ---------------------------------------------------------------------------
// Mapper from raw Graph response
// ---------------------------------------------------------------------------

function toUploadOutput(raw: RawUploadedDriveItem, fallbackDriveId: string): DriveUploadOutput {
  return {
    driveId: raw.parentReference?.driveId ?? fallbackDriveId,
    itemId: raw.id ?? "",
    name: raw.name ?? "",
    webUrl: raw.webUrl ?? "",
    mimeType: raw.file?.mimeType,
    size: raw.size,
  };
}

// ---------------------------------------------------------------------------
// Core upload function (exported for testing)
// ---------------------------------------------------------------------------

export async function uploadItem(args: {
  uploadHttp: UploadHttp;
  session: MsGraphSession;
  input: DriveUploadInput;
  body: Buffer;
  mimeType: string;
}): Promise<DriveUploadOutput> {
  const { uploadHttp, session, input, body, mimeType } = args;
  const { driveId, parentItemId, name, conflictBehavior } = input;

  const totalBytes = Buffer.byteLength(body);

  if (totalBytes <= SIMPLE_UPLOAD_MAX_BYTES) {
    // Simple PUT — single request
    const raw = await uploadHttp.uploadSimple({
      driveId,
      parentItemId,
      name,
      body,
      mimeType,
      conflictBehavior,
      session,
    });
    return toUploadOutput(raw, driveId);
  }

  // Large file — upload session
  const { uploadUrl } = await uploadHttp.createUploadSession({
    driveId,
    parentItemId,
    name,
    conflictBehavior,
    session,
  });

  let offset = 0;
  let lastItem: RawUploadedDriveItem | undefined;

  while (offset < totalBytes) {
    const end = Math.min(offset + CHUNK_SIZE_BYTES, totalBytes);
    const chunk = body.subarray(offset, end);
    const rangeStart = offset;
    const rangeEnd = end - 1;

    // Retry each chunk individually — upload session lets you retry an individual range
    const result = await withGraphRetry(() =>
      uploadHttp.uploadChunk({ uploadUrl, chunk, rangeStart, rangeEnd, total: totalBytes }),
    );

    if (result.item) {
      lastItem = result.item;
    }

    offset = end;
  }

  if (!lastItem) {
    throw new Error(`DriveUploadNode: chunked upload of "${name}" completed but no final driveItem was returned.`);
  }

  return toUploadOutput(lastItem, driveId);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type DriveUploadOptions = Readonly<{
  driveId: string;
  parentItemId: string;
  name: string;
  binarySlot: string;
  conflictBehavior?: ConflictBehavior;
}>;

export class DriveUpload implements RunnableNodeConfig<DriveUploadOptions, DriveUploadOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = DriveUploadNode;
  readonly icon = "si:microsoft" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: DriveUploadOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    return `Upload file \`${this.cfg.name}\` from binary slot \`${this.cfg.binarySlot}\` to drive \`${this.cfg.driveId}\`.`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class DriveUploadNode implements RunnableNode<DriveUpload> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  readonly #uploadHttp: UploadHttp;

  constructor(uploadHttp?: UploadHttp) {
    this.#uploadHttp = uploadHttp ?? makeProductionUploadHttp();
  }

  async execute(args: RunnableNodeExecuteArgs<DriveUpload>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;
    const item = args.item as Item;

    const session = await ctx.getCredential<MsGraphSession>("auth");
    const binary = ctx.binary as NodeBinaryAttachmentService;

    const input = DriveUploadInputSchema.parse({
      driveId: cfg.driveId,
      parentItemId: cfg.parentItemId,
      name: cfg.name,
      binarySlot: cfg.binarySlot,
      conflictBehavior: cfg.conflictBehavior,
    });

    // Read the binary attachment from the incoming item
    const attachment = item.binary?.[input.binarySlot] as BinaryAttachment | undefined;
    if (!attachment) {
      throw new Error(
        `DriveUploadNode: no binary attachment found at slot "${input.binarySlot}". ` +
          "Ensure the upstream node attached the file bytes to this slot.",
      );
    }

    const mimeType = attachment.mimeType ?? "application/octet-stream";

    // Drain the read stream into a Buffer
    const readResult = await binary.openReadStream(attachment);
    if (!readResult) {
      throw new Error(`DriveUploadNode: could not open read stream for binary slot "${input.binarySlot}".`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of readResult.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);

    const output = await uploadItem({
      uploadHttp: this.#uploadHttp,
      session,
      input,
      body,
      mimeType,
    });

    return { ...(args.item as Item), json: output };
  }
}
