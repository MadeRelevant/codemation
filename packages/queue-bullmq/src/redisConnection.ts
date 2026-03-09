export type RedisConnectionConfig =
  | Readonly<{ url: string }>
  | Readonly<{
      host: string;
      port: number;
      username?: string;
      password?: string;
      db?: number;
      /**
       * Enable TLS (typically for `rediss://`).
       */
      tls?: boolean;
    }>;

export class RedisConnectionOptionsFactory {
  static fromConfig(cfg: RedisConnectionConfig): Readonly<Record<string, unknown>> {
    if ("url" in cfg) return this.fromUrl(cfg.url);

    const { host, port, username, password, db, tls } = cfg;
    return {
      host,
      port,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(typeof db === "number" ? { db } : {}),
      ...(tls ? { tls: {} } : {}),
    };
  }

  static fromUrl(redisUrl: string): Readonly<Record<string, unknown>> {
    const u = new URL(redisUrl);
    if (u.protocol !== "redis:" && u.protocol !== "rediss:") throw new Error(`Unsupported redis URL protocol: ${u.protocol}`);

    const host = u.hostname;
    const port = u.port ? Number(u.port) : 6379;
    const username = u.username || undefined;
    const password = u.password || undefined;
    const db = u.pathname && u.pathname !== "/" ? Number(u.pathname.slice(1)) : undefined;
    const tls = u.protocol === "rediss:";

    return this.fromConfig({
      host,
      port,
      username,
      password,
      db: typeof db === "number" && !Number.isNaN(db) ? db : undefined,
      tls,
    });
  }
}

