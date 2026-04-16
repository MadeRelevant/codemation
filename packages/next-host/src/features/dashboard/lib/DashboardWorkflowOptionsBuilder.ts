import type { WorkflowSummary } from "../../workflows/hooks/realtime/realtime";
import { WorkflowFolderTreeBuilder, type WorkflowFolderTreeNode } from "@/shell/WorkflowFolderTreeBuilder";
import type { DashboardMultiSelectHeading, DashboardMultiSelectOption } from "../components/DashboardMultiSelect";

export class DashboardWorkflowOptionsBuilder {
  static buildOptions(
    workflows: ReadonlyArray<WorkflowSummary>,
  ): ReadonlyArray<DashboardMultiSelectOption | DashboardMultiSelectHeading> {
    const tree = new WorkflowFolderTreeBuilder().build(workflows);
    const options: Array<DashboardMultiSelectOption | DashboardMultiSelectHeading> = [];
    for (const workflow of tree.workflows) {
      options.push({
        kind: "option",
        value: workflow.id,
        label: workflow.name,
        depth: 0,
      });
    }
    for (const child of tree.children) {
      this.appendFolderNode(options, child, 0);
    }
    return options;
  }

  private static appendFolderNode(
    options: Array<DashboardMultiSelectOption | DashboardMultiSelectHeading>,
    node: WorkflowFolderTreeNode,
    depth: number,
  ): void {
    options.push({
      kind: "heading",
      label: node.segment,
      depth,
    });
    for (const workflow of node.workflows) {
      options.push({
        kind: "option",
        value: workflow.id,
        label: workflow.name,
        depth: depth + 1,
      });
    }
    for (const child of node.children) {
      this.appendFolderNode(options, child, depth + 1);
    }
  }
}
