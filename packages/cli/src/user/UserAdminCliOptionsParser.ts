import path from "node:path";
import process from "node:process";

import type { UserAdminCliOptions } from "./UserAdminCliBootstrap";

/**
 * Normalizes Commander flags (`--consumer-root`, `--config`) into {@link UserAdminCliOptions}
 * for {@link UserAdminCliBootstrap.withSession}.
 */
export type UserAdminCliCommandOptionsRaw = Readonly<{
  consumerRoot?: string;
  config?: string;
}>;

export class UserAdminCliOptionsParser {
  parse(opts: UserAdminCliCommandOptionsRaw): UserAdminCliOptions {
    const consumerRoot =
      opts.consumerRoot !== undefined && opts.consumerRoot.trim().length > 0
        ? path.resolve(process.cwd(), opts.consumerRoot.trim())
        : undefined;
    const configPath = opts.config !== undefined && opts.config.trim().length > 0 ? opts.config.trim() : undefined;
    return { consumerRoot, configPath };
  }
}
