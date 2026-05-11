import type { WorkflowDto } from "@codemation/host/dto";

export class WorkflowCanvasStructureSignature {
  static create(workflow: WorkflowDto): string {
    return JSON.stringify(workflow);
  }
}
