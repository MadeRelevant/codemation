import type { WorkflowSummary } from "../features/workflows/hooks/realtime/realtime";

export type WorkflowFolderTreeNode = Readonly<{
  segment: string;
  children: ReadonlyArray<WorkflowFolderTreeNode>;
  workflows: ReadonlyArray<WorkflowSummary>;
}>;

type MutableNode = {
  segment: string;
  childMap: Map<string, MutableNode>;
  workflows: WorkflowSummary[];
};

export class WorkflowFolderTreeBuilder {
  build(workflows: ReadonlyArray<WorkflowSummary>): WorkflowFolderTreeNode {
    const root: MutableNode = { segment: "", childMap: new Map(), workflows: [] };
    const sorted = [...workflows].sort((left, right) => {
      const leftKey = (left.discoveryPathSegments ?? []).join("/");
      const rightKey = (right.discoveryPathSegments ?? []).join("/");
      const keyCompare = leftKey.localeCompare(rightKey);
      if (keyCompare !== 0) {
        return keyCompare;
      }
      return left.name.localeCompare(right.name);
    });
    for (const workflow of sorted) {
      this.insertWorkflow(root, workflow);
    }
    return this.freezeNode(root);
  }

  private insertWorkflow(root: MutableNode, workflow: WorkflowSummary): void {
    const segments = workflow.discoveryPathSegments ?? [];
    if (segments.length === 0) {
      root.workflows.push(workflow);
      return;
    }
    const folderParts = segments.length > 1 ? segments.slice(0, -1) : [];
    let node = root;
    for (const part of folderParts) {
      let next = node.childMap.get(part);
      if (!next) {
        next = { segment: part, childMap: new Map(), workflows: [] };
        node.childMap.set(part, next);
      }
      node = next;
    }
    node.workflows.push(workflow);
  }

  private freezeNode(node: MutableNode): WorkflowFolderTreeNode {
    const children = [...node.childMap.values()]
      .sort((left, right) => left.segment.localeCompare(right.segment))
      .map((child) => this.freezeNode(child));
    return {
      segment: node.segment,
      children,
      workflows: [...node.workflows],
    };
  }
}
