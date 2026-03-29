export class MissingRuntimeExecutionMarker {
  isMarked(config: unknown): boolean {
    return Boolean((config as Partial<{ missingRuntime: boolean }> | undefined)?.missingRuntime);
  }
}
