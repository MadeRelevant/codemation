import type {
  CredentialRequirement,
  Item,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
} from "@codemation/core";
import { node } from "@codemation/core";
import { z } from "zod";
import { MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphDriveOAuth";
import { type MsGraphSession } from "../credentials/session";
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
// Injectable HTTP interface — allows test stubbing without network I/O
// ---------------------------------------------------------------------------

export type CopyHttp = {
  /**
   * POST to the copy endpoint. Returns the monitor URL from the Location header
   * plus the HTTP status (expected 202).
   */
  postCopy(args: {
    sourceDriveId: string;
    sourceItemId: string;
    targetDriveId: string;
    targetParentItemId: string;
    name?: string;
    session: MsGraphSession;
  }): Promise<{ monitorUrl: string }>;

  /**
   * Fetch the current status from the monitor URL.
   * Internally wraps in withGraphRetry.
   */
  fetchMonitor(args: { monitorUrl: string; session: MsGraphSession }): Promise<MonitorResponse>;

  /**
   * Fetch full driveItem metadata after the copy completes.
   * Internally wraps in withGraphRetry.
   */
  fetchMetadata(args: { driveId: string; itemId: string; session: MsGraphSession }): Promise<unknown>;
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Production implementation of CopyHttp backed by fetch + the Graph REST API.
 */
function makeProductionCopyHttp(): CopyHttp {
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
// Config
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

export class DriveCopy implements RunnableNodeConfig<DriveCopyOptions, DriveCopyOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = DriveCopyNode;
  readonly icon = "builtin:microsoft-onedrive" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: DriveCopyOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const hasSource = this.cfg.sourceDriveId?.trim() && this.cfg.sourceItemId?.trim();
    const hasTarget = this.cfg.targetDriveId?.trim() && this.cfg.targetParentItemId?.trim();
    const nameSuffix = this.cfg.name ? ` as \`${this.cfg.name}\`` : "";
    const awaitSuffix = this.cfg.awaitCompletion === false ? " (fire-and-forget)" : "";
    if (hasSource && hasTarget) {
      return `Copy \`${this.cfg.sourceItemId}\` to target drive \`${this.cfg.targetDriveId}\`${nameSuffix}${awaitSuffix}.`;
    }
    return `Copy drive item between drives (ids from upstream)${nameSuffix}${awaitSuffix}.`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_DRIVE_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential covering Files.ReadWrite.All.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class DriveCopyNode implements RunnableNode<DriveCopy> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  readonly #copyHttp: CopyHttp;
  readonly #sleep?: (ms: number) => Promise<void>;
  readonly #now?: () => number;

  constructor(copyHttp?: CopyHttp, opts?: { sleep?: (ms: number) => Promise<void>; now?: () => number }) {
    this.#copyHttp = copyHttp ?? makeProductionCopyHttp();
    this.#sleep = opts?.sleep;
    this.#now = opts?.now;
  }

  async execute(args: RunnableNodeExecuteArgs<DriveCopy>): Promise<unknown> {
    const { ctx } = args;
    const cfg = ctx.config.cfg;

    const session = await ctx.getCredential<MsGraphSession>("auth");

    const input = DriveCopyInputSchema.parse({
      sourceDriveId: cfg.sourceDriveId,
      sourceItemId: cfg.sourceItemId,
      targetDriveId: cfg.targetDriveId,
      targetParentItemId: cfg.targetParentItemId,
      name: cfg.name,
      awaitCompletion: cfg.awaitCompletion,
      pollIntervalMs: cfg.pollIntervalMs,
      timeoutMs: cfg.timeoutMs,
    });

    const output = await copyItem({
      copyHttp: this.#copyHttp,
      session,
      sourceDriveId: input.sourceDriveId,
      sourceItemId: input.sourceItemId,
      targetDriveId: input.targetDriveId,
      targetParentItemId: input.targetParentItemId,
      name: input.name,
      awaitCompletion: input.awaitCompletion,
      pollIntervalMs: input.pollIntervalMs,
      timeoutMs: input.timeoutMs,
      sleep: this.#sleep,
      now: this.#now,
    });

    return { ...(args.item as Item), json: output };
  }
}
