import type { WorkflowSummary } from "../../workflows/hooks/realtime/realtime";

export class TelemetryDashboardFolderResolver {
  static listFolders(workflows: ReadonlyArray<WorkflowSummary>): ReadonlyArray<string> {
    return [...new Set(workflows.flatMap((workflow) => this.readFolder(workflow) ?? []))].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  static resolveWorkflowIds(
    workflows: ReadonlyArray<WorkflowSummary>,
    selectedWorkflowIds: ReadonlyArray<string>,
    selectedFolders: ReadonlyArray<string>,
  ): ReadonlyArray<string> | undefined {
    const resolved = new Set(selectedWorkflowIds);
    if (selectedFolders.length > 0) {
      for (const workflow of workflows) {
        const folder = this.readFolder(workflow);
        if (folder && selectedFolders.includes(folder)) {
          resolved.add(workflow.id);
        }
      }
    }
    return resolved.size > 0 ? [...resolved].sort((a, b) => a.localeCompare(b)) : undefined;
  }

  private static readFolder(workflow: WorkflowSummary): string | undefined {
    const segments = workflow.discoveryPathSegments ?? [];
    if (segments.length <= 1) {
      return undefined;
    }
    return segments.slice(0, -1).join("/");
  }
}
