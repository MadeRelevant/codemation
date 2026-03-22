import type { WorkflowSummary } from "../features/workflows/hooks/realtime/realtime";

import type { WorkflowFolderTreeNode } from "./WorkflowFolderTreeBuilder";

export class WorkflowFolderUi {
  /** Expand folders that lie on the path to the workflow open in the shell. */
  static computeDefaultFolderOpen(
    folderPath: readonly string[],
    pathname: string,
    workflows: ReadonlyArray<WorkflowSummary>,
  ): boolean {
    if (folderPath.length === 0) {
      return true;
    }
    const match = pathname.match(/^\/workflows\/([^/]+)/);
    if (!match) {
      return true;
    }
    const active = workflows.find((w) => w.id === decodeURIComponent(match[1]!));
    if (!active) {
      return true;
    }
    const segs = active.discoveryPathSegments;
    if (segs.length < folderPath.length) {
      return false;
    }
    for (let i = 0; i < folderPath.length; i += 1) {
      if (segs[i] !== folderPath[i]) {
        return false;
      }
    }
    return true;
  }

  static countWorkflowsInSubtree(node: WorkflowFolderTreeNode): number {
    let total = node.workflows.length;
    for (const child of node.children) {
      total += WorkflowFolderUi.countWorkflowsInSubtree(child);
    }
    return total;
  }
}
