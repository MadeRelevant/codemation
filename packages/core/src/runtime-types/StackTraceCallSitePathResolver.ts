export class StackTraceCallSitePathResolver {
  static resolve(decoratorFileUrl: string): string | undefined {
    const stack = new Error().stack ?? "";
    for (const line of stack.split("\n")) {
      const candidate = this.extractPath(line.trim());
      if (!candidate) {
        continue;
      }
      if (candidate === decoratorFileUrl || candidate.includes("runtimeTypeDecorators")) {
        continue;
      }
      return candidate;
    }
    return undefined;
  }

  private static extractPath(line: string): string | undefined {
    const fileUrlMatch = line.match(/file:\/\/[^\s)]+/);
    if (fileUrlMatch) return fileUrlMatch[0];
    const parenMatch = line.match(/\((\/[^)]+)\)/);
    if (parenMatch) return parenMatch[1];
    const bareMatch = line.match(/at (\/[^\s]+)/);
    return bareMatch?.[1];
  }
}

