import type { TypeToken } from "../di";

/**
 * Seam interfaces for HITL story 02 collaborators that are implemented in `@codemation/host`
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
