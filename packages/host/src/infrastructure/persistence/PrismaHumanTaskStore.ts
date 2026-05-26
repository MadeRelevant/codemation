import { inject, injectable } from "@codemation/core";
import type { HumanTaskActor, HumanTaskRecord, HumanTaskStore } from "@codemation/core";
import type { JsonValue } from "@codemation/core";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

@injectable()
export class PrismaHumanTaskStore implements HumanTaskStore {
  constructor(@inject(PrismaDatabaseClientToken) private readonly prisma: PrismaDatabaseClient) {}

  async create(record: HumanTaskRecord): Promise<void> {
    await this.prisma.humanTask.create({
      data: {
        id: record.id,
        runId: record.runId,
        workflowId: record.workflowId,
        workspaceId: record.workspaceId ?? null,
        nodeId: record.nodeId,
        activationId: record.activationId,
        itemIndex: record.itemIndex,
        status: record.status,
        channel: record.channel,
        subjectJson: JSON.stringify(record.subject),
        metadataJson: JSON.stringify(record.metadata),
        decisionSchemaJson: record.decisionSchemaJson,
        decisionSchemaHash: record.decisionSchemaHash,
        onTimeout: record.onTimeout,
        deliveryRefJson: record.deliveryRef !== undefined ? JSON.stringify(record.deliveryRef) : null,
        decisionJson: null,
        decidedAt: null,
        decidedByJson: null,
        resumeTokenHash: record.resumeTokenHash,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
      },
    });
  }

  async findById(taskId: string): Promise<HumanTaskRecord | undefined> {
    const row = await this.prisma.humanTask.findUnique({ where: { id: taskId } });
    return row ? this.toRecord(row) : undefined;
  }

  async findByResumeTokenHash(tokenHash: string): Promise<HumanTaskRecord | undefined> {
    const row = await this.prisma.humanTask.findFirst({ where: { resumeTokenHash: tokenHash } });
    return row ? this.toRecord(row) : undefined;
  }

  async findPendingForWorkspace(workspaceId: string): Promise<ReadonlyArray<HumanTaskRecord>> {
    const rows = await this.prisma.humanTask.findMany({
      where: { workspaceId, status: "pending" },
      orderBy: { expiresAt: "asc" },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async markDecided(args: {
    taskId: string;
    decision: JsonValue;
    decidedBy: HumanTaskActor;
    decidedAt: Date;
  }): Promise<void> {
    await this.prisma.humanTask.update({
      where: { id: args.taskId },
      data: {
        status: "decided",
        decisionJson: JSON.stringify(args.decision),
        decidedAt: args.decidedAt,
        decidedByJson: JSON.stringify(args.decidedBy),
      },
    });
  }

  async markTimedOut(taskId: string): Promise<void> {
    await this.prisma.humanTask.update({
      where: { id: taskId },
      data: { status: "timed_out" },
    });
  }

  async markAutoAccepted(taskId: string): Promise<void> {
    await this.prisma.humanTask.update({
      where: { id: taskId },
      data: { status: "auto_accepted" },
    });
  }

  async markCancelled(taskId: string): Promise<void> {
    await this.prisma.humanTask.update({
      where: { id: taskId },
      data: { status: "cancelled" },
    });
  }

  async cancelPendingForRun(runId: string): Promise<void> {
    await this.prisma.humanTask.updateMany({
      where: { runId, status: "pending" },
      data: { status: "cancelled" },
    });
  }

  private toRecord(row: {
    id: string;
    runId: string;
    workflowId: string;
    workspaceId: string | null;
    nodeId: string;
    activationId: string;
    itemIndex: number;
    status: string;
    channel: string;
    subjectJson: string;
    metadataJson: string;
    decisionSchemaJson: string;
    decisionSchemaHash: string;
    onTimeout: string;
    deliveryRefJson: string | null;
    decisionJson: string | null;
    decidedAt: Date | null;
    decidedByJson: string | null;
    resumeTokenHash: string;
    expiresAt: Date;
    createdAt: Date;
  }): HumanTaskRecord {
    return {
      id: row.id,
      runId: row.runId,
      workflowId: row.workflowId,
      workspaceId: row.workspaceId ?? undefined,
      nodeId: row.nodeId,
      activationId: row.activationId,
      itemIndex: row.itemIndex,
      status: row.status as HumanTaskRecord["status"],
      channel: row.channel,
      subject: JSON.parse(row.subjectJson),
      metadata: JSON.parse(row.metadataJson),
      decisionSchemaJson: row.decisionSchemaJson,
      decisionSchemaHash: row.decisionSchemaHash,
      onTimeout: row.onTimeout as "halt" | "auto-accept",
      deliveryRef: row.deliveryRefJson !== null ? (JSON.parse(row.deliveryRefJson) as JsonValue) : undefined,
      decision: row.decisionJson !== null ? (JSON.parse(row.decisionJson) as JsonValue) : undefined,
      decidedAt: row.decidedAt ?? undefined,
      decidedBy: row.decidedByJson !== null ? JSON.parse(row.decidedByJson) : undefined,
      resumeTokenHash: row.resumeTokenHash,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }
}
