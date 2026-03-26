import { inject, injectable } from "@codemation/core";
import { PrismaClient } from "./generated/prisma-client/client.js";
import type {
  WorkflowActivationRepository,
  WorkflowActivationRow,
} from "../../domain/workflows/WorkflowActivationRepository";

@injectable()
export class PrismaWorkflowActivationRepository implements WorkflowActivationRepository {
  constructor(@inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async loadAll(): Promise<ReadonlyArray<WorkflowActivationRow>> {
    const rows = await this.prisma.workflowActivation.findMany();
    return rows.map((row) => ({
      workflowId: row.workflowId,
      isActive: row.isActive,
    }));
  }

  async upsert(workflowId: string, active: boolean): Promise<void> {
    const id = decodeURIComponent(workflowId);
    const updatedAt = new Date().toISOString();
    await this.prisma.workflowActivation.upsert({
      where: { workflowId: id },
      create: {
        workflowId: id,
        isActive: active,
        updatedAt,
      },
      update: {
        isActive: active,
        updatedAt,
      },
    });
  }
}
