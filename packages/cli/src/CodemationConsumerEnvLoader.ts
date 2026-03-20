import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

/**
 * Loads the consumer project's dotenv files so `codemation dev` can forward them to the Next host.
 * Next.js runs from `packages/next-host` and does not read `apps/<consumer>/.env` automatically.
 */
export class CodemationConsumerEnvLoader {
  static load(consumerRoot: string): Readonly<Record<string, string>> {
    const merged: Record<string, string> = {};
    for (const relativeName of [".env", ".env.local"] as const) {
      const absolutePath = path.resolve(consumerRoot, relativeName);
      if (!existsSync(absolutePath)) {
        continue;
      }
      const parsed = parse(readFileSync(absolutePath, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        if (value !== undefined) {
          merged[key] = value;
        }
      }
    }
    return merged;
  }
}
