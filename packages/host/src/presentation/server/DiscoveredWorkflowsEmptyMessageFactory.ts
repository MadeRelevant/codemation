export class DiscoveredWorkflowsEmptyMessageFactory {
  create(discoveredPaths: ReadonlyArray<string>): string {
    const lines = discoveredPaths.map((p) => `  - ${p}`).join("\n");
    return [
      `Discovered ${discoveredPaths.length} file(s) under workflow discovery, but none export a WorkflowDefinition.`,
      lines,
      "",
      "Move shared helpers outside the discovery directories (for example src/lib), or export at least one object with id, name, nodes, and edges from a workflow module.",
    ].join("\n");
  }
}
