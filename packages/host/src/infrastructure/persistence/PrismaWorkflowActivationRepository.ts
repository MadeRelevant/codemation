import { inject, injectable } from "@codemation/core";
import type {
  WorkflowActivationRepository,
  WorkflowActivationRow,
} from "../../domain/workflows/WorkflowActivationRepository";
import { PrismaDatabaseClientToken, type PrismaDatabaseClient } from "./PrismaDatabaseClient";

@injectable()
export class PrismaWorkflowActivationRepository implements WorkflowActivationRepository {
  constructor(@inject(PrismaDatabaseClientToken) private readonly prisma: PrismaDatabaseClient) {}

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
