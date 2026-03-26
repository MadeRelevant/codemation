import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Ensures `CODEMATION_TSCONFIG_PATH` points at the repo's `tsconfig.codemation-tsx.json` when present,
 * so tsx can load consumer `codemation.config.ts` files that import decorator-using workspace packages.
 */
export class ConsumerCliTsconfigPreparation {
  applyWorkspaceTsconfigForTsxIfPresent(consumerRoot: string): void {
    if (process.env.CODEMATION_TSCONFIG_PATH && process.env.CODEMATION_TSCONFIG_PATH.trim().length > 0) {
      return;
    }
    const resolvedRoot = path.resolve(consumerRoot);
    const candidates = [
      path.resolve(resolvedRoot, "tsconfig.codemation-tsx.json"),
      path.resolve(resolvedRoot, "..", "tsconfig.codemation-tsx.json"),
      path.resolve(resolvedRoot, "..", "..", "tsconfig.codemation-tsx.json"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        process.env.CODEMATION_TSCONFIG_PATH = candidate;
        return;
      }
    }
  }
}
