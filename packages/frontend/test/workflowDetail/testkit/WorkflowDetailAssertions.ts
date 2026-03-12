import { expect } from "vitest";
import { screen } from "@testing-library/react";

export class WorkflowStatusAssertions {
  static expectNodePresence(container: HTMLElement, nodeIds: ReadonlyArray<string>): void {
    for (const nodeId of nodeIds) {
      const element = container.querySelector<HTMLElement>(`[data-codemation-node-id="${nodeId}"]`);
      expect(element).not.toBeNull();
    }
  }

  static expectStatuses(
    container: HTMLElement,
    expectedByNodeId: Readonly<Record<string, "pending" | "running" | "completed">>,
  ): void {
    for (const [nodeId, status] of Object.entries(expectedByNodeId)) {
      const element = container.querySelector<HTMLElement>(`[data-codemation-node-id="${nodeId}"]`);
      expect(element).not.toBeNull();
      expect(element).toHaveAttribute("data-codemation-node-status", status);
    }
  }
}

export class WorkflowExecutionTreeAssertions {
  static expectNodePresence(nodeIds: ReadonlyArray<string>): void {
    for (const nodeId of nodeIds) {
      expect(screen.getByTestId(`execution-tree-node-${nodeId}`)).toBeInTheDocument();
    }
  }
}
