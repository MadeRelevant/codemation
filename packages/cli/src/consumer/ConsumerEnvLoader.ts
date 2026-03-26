import { parse } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads the consumer project's dotenv files so `codemation dev` can forward them to the Next host.
 * Next.js runs from `packages/next-host` and does not read `apps/<consumer>/.env` automatically.
 */
export class ConsumerEnvLoader {
  load(consumerRoot: string): Readonly<Record<string, string>> {
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

  /**
   * Merges consumer `.env` / `.env.local` values into a process environment snapshot.
   * Consumer keys override the base snapshot for most variables. `DATABASE_URL` and `AUTH_SECRET`
   * prefer the base (shell) when set, matching the dev Next host spawn behavior.
   */
  mergeIntoProcessEnvironment(
    processEnv: NodeJS.ProcessEnv,
    consumerEnv: Readonly<Record<string, string>>,
  ): NodeJS.ProcessEnv {
    return {
      ...processEnv,
      ...consumerEnv,
      DATABASE_URL: processEnv.DATABASE_URL ?? consumerEnv.DATABASE_URL,
      AUTH_SECRET: processEnv.AUTH_SECRET ?? consumerEnv.AUTH_SECRET,
    };
  }

  mergeConsumerRootIntoProcessEnvironment(consumerRoot: string, processEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return this.mergeIntoProcessEnvironment(processEnv, this.load(consumerRoot));
  }
}
