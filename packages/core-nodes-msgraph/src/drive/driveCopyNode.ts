import { defineNode } from "@codemation/core";
import { z } from "zod";
import { msGraphDriveOAuthCredentialType } from "../credentials/msGraphDriveOAuth";
import type { MsGraphSession } from "../credentials/session";
import { withGraphRetry } from "../lib/graphRetry";
import { toCanonicalFull, type DriveItemFull } from "./driveItemMapper";

// ---------------------------------------------------------------------------
// Output shapes (discriminated union on `status`)
// ---------------------------------------------------------------------------

export type DriveCopyPendingOutput = {
  status: "pending";
  monitorUrl: string;
  sourceDriveId: string;
  sourceItemId: string;
};

export type DriveCopyCompletedOutput = DriveItemFull & { status: "completed" };

export type DriveCopyOutput = DriveCopyPendingOutput | DriveCopyCompletedOutput;

// ---------------------------------------------------------------------------
// Raw Graph monitor response shape
// ---------------------------------------------------------------------------

type MonitorResponse = {
  status: "notStarted" | "inProgress" | "completed" | "failed";
  resourceId?: string;
  percentageComplete?: number;
  error?: { code?: string; message?: string };
};

// ---------------------------------------------------------------------------
// Injectable HTTP interface
// ---------------------------------------------------------------------------

export type CopyHttp = {
  postCopy(args: {
    sourceDriveId: string;
    sourceItemId: string;
    targetDriveId: string;
    targetParentItemId: string;
    name?: string;
    session: MsGraphSession;
  }): Promise<{ monitorUrl: string }>;

  fetchMonitor(args: { monitorUrl: string; session: MsGraphSession }): Promise<MonitorResponse>;

  fetchMetadata(args: { driveId: string; itemId: string; session: MsGraphSession }): Promise<unknown>;
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function makeProductionCopyHttp(): CopyHttp {
  return {
    async postCopy({ sourceDriveId, sourceItemId, targetDriveId, targetParentItemId, name, session }) {
      const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(sourceDriveId)}/items/${encodeURIComponent(sourceItemId)}/copy`;

      const body: Record<string, unknown> = {
        parentReference: { driveId: targetDriveId, id: targetParentItemId },
      };
      if (name !== undefined) body["name"] = name;

      const accessToken = await session.refresh();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status !== 202) {
        const err = Object.assign(new Error(`DriveCopyNode: copy POST returned ${res.status}`), {
          statusCode: res.status,
        });
        throw err;
      }

      const location = res.headers.get("location");
      if (!location) {
        throw new Error("DriveCopyNode: copy POST returned 202 but no Location header");
      }
      return { monitorUrl: location };
    },

    async fetchMonitor({ monitorUrl, session }) {
      const accessToken = await session.refresh();
      const res = await fetch(monitorUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const err = Object.assign(new Error(`DriveCopyNode: monitor fetch returned ${res.status}`), {
          statusCode: res.status,
        });
        throw err;
      }
      return (await res.json()) as MonitorResponse;
    },

    async fetchMetadata({ driveId, itemId, session }) {
      const accessToken = await session.refresh();
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        const err = Object.assign(new Error(`DriveCopyNode: metadata fetch returned ${res.status}`), {
          statusCode: res.status,
        });
        throw err;
      }
      return res.json();
    },
  };
}

// ---------------------------------------------------------------------------
// Core copy function (exported for testing)
// ---------------------------------------------------------------------------

export async function copyItem(args: {
  copyHttp: CopyHttp;
  session: MsGraphSession;
  sourceDriveId: string;
  sourceItemId: string;
  targetDriveId: string;
  targetParentItemId: string;
  name?: string;
  awaitCompletion: boolean;
  pollIntervalMs: number;
  timeoutMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<DriveCopyOutput> {
  const {
    copyHttp,
    session,
    sourceDriveId,
    sourceItemId,
    targetDriveId,
    targetParentItemId,
    name,
    awaitCompletion,
    pollIntervalMs,
    timeoutMs,
    sleep = defaultSleep,
    now = () => globalThis.Date.now(),
  } = args;

  // Step 1: POST the copy request (wrapped in retry for transient errors)
  const { monitorUrl } = await withGraphRetry(() =>
    copyHttp.postCopy({ sourceDriveId, sourceItemId, targetDriveId, targetParentItemId, name, session }),
  );

  if (!awaitCompletion) {
    return {
      status: "pending",
      monitorUrl,
      sourceDriveId,
      sourceItemId,
    };
  }

  // Step 2: Poll the monitor URL
  const deadline = now() + timeoutMs;

  while (true) {
    const monitor = await withGraphRetry(() => copyHttp.fetchMonitor({ monitorUrl, session }));

    if (monitor.status === "completed") {
      if (!monitor.resourceId) {
        throw new Error("DriveCopyNode: copy completed but resourceId is missing from monitor response");
      }

      // Step 3: Fetch metadata for the newly copied item
      const raw = await withGraphRetry(() =>
        copyHttp.fetchMetadata({ driveId: targetDriveId, itemId: monitor.resourceId!, session }),
      );

      const full = toCanonicalFull(raw as Parameters<typeof toCanonicalFull>[0], targetDriveId);
      return { ...full, status: "completed" };
    }

    if (monitor.status === "failed") {
      const code = monitor.error?.code ?? "unknown";
      const message = monitor.error?.message ?? "Copy operation failed";
      throw Object.assign(new Error(`DriveCopyNode: copy failed — Graph error [${code}]: ${message}`), {
        graphErrorCode: code,
      });
    }

    // Still in progress — check timeout before sleeping
    if (now() >= deadline) {
      throw new Error(`DriveCopyNode: copy timed out after ${timeoutMs}ms. Last status: ${monitor.status}`);
    }

    await sleep(pollIntervalMs);
  }
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const DriveCopyInputSchema = z.object({
  sourceDriveId: z.string().min(1),
  sourceItemId: z.string().min(1),
  targetDriveId: z.string().min(1),
  targetParentItemId: z.string().min(1),
  name: z.string().optional(),
  awaitCompletion: z.boolean().default(true),
  pollIntervalMs: z.number().int().min(100).default(1_000),
  timeoutMs: z
    .number()
    .int()
    .min(1_000)
    .default(5 * 60_000),
});

export type DriveCopyInput = z.infer<typeof DriveCopyInputSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DriveCopyOptions = Readonly<{
  sourceDriveId: string;
  sourceItemId: string;
  targetDriveId: string;
  targetParentItemId: string;
  name?: string;
  awaitCompletion?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
}>;

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const driveCopyNode = defineNode({
  key: "msgraph-drive.copy",
  title: "Copy drive item",
  description:
    "Copy a drive item to another drive/folder. Optionally awaits completion and returns the new item metadata.",
  icon: "builtin:microsoft-onedrive",
  inspectorSummary({ config }) {
    const cfg = config as unknown as DriveCopyOptions;
    const rows = [];
    if (cfg.sourceDriveId) rows.push({ label: "Source drive", value: cfg.sourceDriveId.slice(0, 80) });
    if (cfg.targetDriveId) rows.push({ label: "Target drive", value: cfg.targetDriveId.slice(0, 80) });
    if (cfg.name) rows.push({ label: "New name", value: cfg.name.slice(0, 80) });
    if (cfg.awaitCompletion) rows.push({ label: "Await completion", value: "yes" });
    return rows.length > 0 ? rows : undefined;
  },
  credentials: {
    auth: {
      type: msGraphDriveOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
    },
  },
  async execute(_, { config, credentials }) {
    const session = (await credentials.auth()) as MsGraphSession;

    const input = DriveCopyInputSchema.parse({
      sourceDriveId: config.sourceDriveId,
      sourceItemId: config.sourceItemId,
      targetDriveId: config.targetDriveId,
      targetParentItemId: config.targetParentItemId,
      name: config.name,
      awaitCompletion: config.awaitCompletion,
      pollIntervalMs: config.pollIntervalMs,
      timeoutMs: config.timeoutMs,
    });

    return await copyItem({
      copyHttp: makeProductionCopyHttp(),
      session,
      sourceDriveId: input.sourceDriveId,
      sourceItemId: input.sourceItemId,
      targetDriveId: input.targetDriveId,
      targetParentItemId: input.targetParentItemId,
      name: input.name,
      awaitCompletion: input.awaitCompletion,
      pollIntervalMs: input.pollIntervalMs,
      timeoutMs: input.timeoutMs,
    });
  },
});
