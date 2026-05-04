import path from "node:path";
import process from "node:process";

import type { CollectionsCliOptions } from "./CollectionsCliBootstrap";

/**
 * Normalizes Commander flags (`--consumer-root`, `--config`) into {@link CollectionsCliOptions}
 * for {@link CollectionsCliBootstrap.withSession}.
 */
export type CollectionsCliCommandOptionsRaw = Readonly<{
  consumerRoot?: string;
  config?: string;
}>;

export class CollectionsCliOptionsParser {
  parse(opts: CollectionsCliCommandOptionsRaw): CollectionsCliOptions {
    const consumerRoot =
      opts.consumerRoot !== undefined && opts.consumerRoot.trim().length > 0
        ? path.resolve(process.cwd(), opts.consumerRoot.trim())
        : undefined;
    const configPath = opts.config !== undefined && opts.config.trim().length > 0 ? opts.config.trim() : undefined;
    return { consumerRoot, configPath };
  }
}
