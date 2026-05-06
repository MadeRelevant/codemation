import { defineNode } from "@codemation/core";
import type { BinaryAttachment, NodeBinaryAttachmentService } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import { createGraphClient } from "../credentials/session";
import type { MsGraphSession } from "../credentials/session";
import { withGraphRetry } from "../lib/graphRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024; // 4 MiB
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
// Isolated HTTP interface
// ---------------------------------------------------------------------------

export type UploadSessionResponse = {
  uploadUrl: string;
};

export type ChunkUploadResult = {
  status: number;
  item?: RawUploadedDriveItem;
};

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
export function makeProductionUploadHttp(): UploadHttp {
  return {
    async uploadSimple({ driveId, parentItemId, name, body, mimeType, conflictBehavior, session }) {
      const url =
        `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(name)}:/content` +
        `?@microsoft.graph.conflictBehavior=${encodeURIComponent(conflictBehavior)}`;

      const result = await withGraphRetry(async () => {
        const accessToken = await session.refresh();
        const response = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": mimeType,
          },
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
  driveId: z.string().min(1),
  parentItemId: z.string().min(1),
  name: z.string().min(1),
  binarySlot: z.string().min(1),
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
// Mapper
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
// Types
// ---------------------------------------------------------------------------

export type DriveUploadOptions = Readonly<{
  driveId: string;
  parentItemId: string;
  name: string;
  binarySlot: string;
  conflictBehavior?: ConflictBehavior;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const driveUploadNode = defineNode({
  key: "msgraph-drive.upload",
  title: "Upload to OneDrive",
  description: "Upload a file from a binary slot to OneDrive/SharePoint. Falls back to item.json ids.",
  icon: "builtin:microsoft-onedrive",
  credentials: {
    auth: {
      type: msGraphDriveOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
    },
  },
  async execute({ item }, { config, credentials, execution }) {
    const session = (await credentials.auth()) as MsGraphSession;
    const binary = execution.binary as NodeBinaryAttachmentService;

    // Fall back to item.json so DriveResolve(folder) → DriveUpload chains without UI wiring.
    const fromItem = (item.json ?? {}) as { driveId?: string; itemId?: string };
    const input = DriveUploadInputSchema.parse({
      driveId: config.driveId || fromItem.driveId,
      parentItemId: config.parentItemId || fromItem.itemId,
      name: config.name,
      binarySlot: config.binarySlot,
      conflictBehavior: config.conflictBehavior,
    });

    // Read the binary attachment from the incoming item
    const attachment = (item.binary as Record<string, BinaryAttachment> | undefined)?.[input.binarySlot];
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

    return await uploadItem({
      uploadHttp: makeProductionUploadHttp(),
      session,
      input,
      body,
      mimeType,
    });
  },
});
