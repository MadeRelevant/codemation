export class MissingRuntimeExecutionMarker {
  static isMarked(config: unknown): boolean {
    return Boolean((config as Partial<{ missingRuntime: boolean }> | undefined)?.missingRuntime);
  }
}
