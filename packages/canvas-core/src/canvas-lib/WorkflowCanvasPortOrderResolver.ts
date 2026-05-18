/**
 * Stable ordering for workflow I/O ports on canvas handles so branches (e.g. true/false)
 * stack predictably: true above false, merge inputs aligned with branch geometry.
 */
export class WorkflowCanvasPortOrderResolver {
  static sortSourceOutputs(ports: readonly string[]): string[] {
    const rank = (p: string): number => {
      if (p === "true") return 0;
      if (p === "false") return 1;
      if (p === "main") return 2;
      if (p === "error") return 3;
      return 4;
    };
    return [...new Set(ports)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }

  static sortTargetInputs(ports: readonly string[]): string[] {
    const rank = (p: string): number => {
      if (p === "true") return 0;
      if (p === "false") return 1;
      if (p === "in") return 2;
      return 3;
    };
    return [...new Set(ports)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }
}
