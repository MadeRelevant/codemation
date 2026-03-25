import { config as loadDotenv } from "dotenv";
import path from "node:path";

/**
 * Loads the consumer project's `.env` for `codemation user *` commands.
 * Uses {@link loadDotenv}'s `override: true` so values in the consumer file win over variables
 * already present in the process environment (e.g. a leftover `DATABASE_URL` from the shell).
 * Otherwise a misconfigured `.env` is silently ignored and the CLI may connect to a different database,
 * surfacing misleading results such as "No users found."
 */
export class UserAdminConsumerDotenvLoader {
  load(consumerRoot: string): void {
    loadDotenv({
      path: path.resolve(consumerRoot, ".env"),
      override: true,
      quiet: true,
    });
  }
}
