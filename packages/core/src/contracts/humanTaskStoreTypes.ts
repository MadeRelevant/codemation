import type { TypeToken } from "../di";
import type { HumanTaskActor, HumanTaskSubject } from "./runtimeTypes";
import type { JsonValue } from "./workflowTypes";

export type HumanTaskStatus = "pending" | "decided" | "timed_out" | "auto_accepted" | "cancelled";

/** Persisted record for a single HITL task instance. */
export interface HumanTaskRecord {
  readonly id: string;
  readonly runId: string;
  readonly workflowId: string;
  readonly workspaceId?: string;
  readonly nodeId: string;
  readonly activationId: string;
  readonly itemIndex: number;
  readonly status: HumanTaskStatus;
  readonly channel: string;
  readonly subject: HumanTaskSubject;
  readonly metadata: Record<string, JsonValue>;
  readonly decisionSchemaJson: string;
  readonly decisionSchemaHash: string;
  readonly onTimeout: "halt" | "auto-accept";
  readonly deliveryRef?: JsonValue;
  readonly decision?: JsonValue;
  readonly decidedAt?: Date;
  readonly decidedBy?: HumanTaskActor;
  readonly resumeTokenHash: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export interface HumanTaskStore {
  create(record: HumanTaskRecord): Promise<void>;
  findById(taskId: string): Promise<HumanTaskRecord | undefined>;
  findByResumeTokenHash(tokenHash: string): Promise<HumanTaskRecord | undefined>;
  findPendingForWorkspace(workspaceId: string): Promise<ReadonlyArray<HumanTaskRecord>>;
  markDecided(args: { taskId: string; decision: JsonValue; decidedBy: HumanTaskActor; decidedAt: Date }): Promise<void>;
  markTimedOut(taskId: string): Promise<void>;
  markAutoAccepted(taskId: string): Promise<void>;
  markCancelled(taskId: string): Promise<void>;
  cancelPendingForRun(runId: string): Promise<void>;
}

export const HumanTaskStoreToken = Symbol.for("codemation.core.HumanTaskStore") as TypeToken<
  HumanTaskStore | undefined
>;
