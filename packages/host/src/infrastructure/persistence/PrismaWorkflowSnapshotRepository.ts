import { createHash } from "node:crypto";
import { inject, injectable } from "@codemation/core";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

export interface WorkflowSnapshotRepository {
  /**
   * Returns the id of an existing snapshot matching (workflowId, snapshotHash), or creates
   * a new one from the provided snapshotJson. Deduplication is by content hash.
   */
  findOrCreate(args: Readonly<{ workflowId: string; snapshotJson: string }>): Promise<string>;
}

@injectable()
export class PrismaWorkflowSnapshotRepository implements WorkflowSnapshotRepository {
  constructor(
    @inject(PrismaDatabaseClientToken)
    private readonly prisma: PrismaDatabaseClient,
  ) {}

  async findOrCreate(args: Readonly<{ workflowId: string; snapshotJson: string }>): Promise<string> {
    const snapshotHash = createHash("sha256").update(args.snapshotJson, "utf8").digest("hex");
    const existing = await this.prisma.workflowSnapshot.findUnique({
      where: { workflowId_snapshotHash: { workflowId: args.workflowId, snapshotHash } },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const id = crypto.randomUUID();
    await this.prisma.workflowSnapshot.upsert({
      where: { workflowId_snapshotHash: { workflowId: args.workflowId, snapshotHash } },
      create: {
        id,
        workflowId: args.workflowId,
        snapshotHash,
        snapshotJson: args.snapshotJson,
        createdAt: new Date().toISOString(),
      },
      update: {},
    });
    // Re-fetch so the returned id is the winner under concurrent inserts
    const row = await this.prisma.workflowSnapshot.findUniqueOrThrow({
      where: { workflowId_snapshotHash: { workflowId: args.workflowId, snapshotHash } },
      select: { id: true },
    });
    return row.id;
  }
}
