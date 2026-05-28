import type { TypeToken } from "../di";

/**
 * Seam interfaces for HITL collaborators that are implemented in `@codemation/host`
 * and injected into `NodeSuspensionHandler` at runtime. Core defines the interface only —
 * no HTTP, vendor SDK, or Prisma dependencies here.
 */

/** Signs and hashes a HITL resume token. Core only needs the sign and hash operations. */
export interface HitlResumeTokenSignerSeam {
  sign(args: { taskId: string; expiresAt: Date; schemaHash: string }): string;
  hashToken(token: string): string;
}

/** Schedules a delayed BullMQ job that drives the timeout path. */
export interface HitlTimeoutJobSchedulerSeam {
  enqueueTimeoutJob(args: { taskId: string; expiresAt: Date }): Promise<void>;
}

export const HitlResumeTokenSignerToken = Symbol.for("codemation.core.HitlResumeTokenSigner") as TypeToken<
  HitlResumeTokenSignerSeam | undefined
>;

export const HitlTimeoutJobSchedulerToken = Symbol.for("codemation.core.HitlTimeoutJobScheduler") as TypeToken<
  HitlTimeoutJobSchedulerSeam | undefined
>;

/**
 * Optional workspace ID injected into NodeSuspensionHandler in managed mode (T7 security fix).
 * Allows the handler to stamp the workspaceId on each HumanTaskRecord so HitlCallbackHandler
 * can assert workspace identity independently of the HMAC middleware.
 * Not registered in non-managed mode; NodeSuspensionHandler defaults to null.
 */
export const HitlWorkspaceIdToken = Symbol.for("codemation.core.HitlWorkspaceId") as TypeToken<string | undefined>;
