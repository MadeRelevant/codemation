export type RedisConnectionConfig =
  | Readonly<{ url: string }>
  | Readonly<{
      host: string;
      port: number;
      username?: string;
      password?: string;
      db?: number;
      tls?: boolean;
    }>;

export class RedisConnectionOptionsFactory {
  private static readonly bullMqIoredisDefaults = {
    maxRetriesPerRequest: null,
  } as const;

  static fromConfig(cfg: RedisConnectionConfig): Readonly<Record<string, unknown>> {
    if ("url" in cfg) {
      return this.fromUrl(cfg.url);
    }
    const { host, port, username, password, db, tls } = cfg;
    return {
      ...this.bullMqIoredisDefaults,
      host,
      port,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(typeof db === "number" ? { db } : {}),
      ...(tls ? { tls: {} } : {}),
    };
  }

  static fromUrl(redisUrl: string): Readonly<Record<string, unknown>> {
    const url = new URL(redisUrl);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      throw new Error(`Unsupported redis URL protocol: ${url.protocol}`);
    }
    const db = url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined;
    return this.fromConfig({
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      db: typeof db === "number" && !Number.isNaN(db) ? db : undefined,
      tls: url.protocol === "rediss:",
    });
  }
}
