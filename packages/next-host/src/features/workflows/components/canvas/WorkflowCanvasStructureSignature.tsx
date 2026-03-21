







import type { WorkflowDto } from "../../lib/realtime/workflowTypes";



export class WorkflowCanvasStructureSignature {
  static create(workflow: WorkflowDto): string {
    return JSON.stringify(workflow);
  }
}
