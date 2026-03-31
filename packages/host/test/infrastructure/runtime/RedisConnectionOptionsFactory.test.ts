import { describe, expect, it } from "vitest";

import { RedisConnectionOptionsFactory } from "../../../src/infrastructure/scheduler/bullmq/RedisConnectionOptionsFactory";

describe("RedisConnectionOptionsFactory", () => {
  it("fromUrl parses redis:// with host, port, password, and db index", () => {
    const opts = RedisConnectionOptionsFactory.fromUrl("redis://:secret@127.0.0.1:6380/2");
    expect(opts).toMatchObject({
      host: "127.0.0.1",
      port: 6380,
      password: "secret",
      db: 2,
      maxRetriesPerRequest: null,
    });
    expect(opts).not.toHaveProperty("tls");
  });

  it("fromUrl sets tls for rediss://", () => {
    const opts = RedisConnectionOptionsFactory.fromUrl("rediss://example.com:6379");
    expect(opts).toMatchObject({
      host: "example.com",
      port: 6379,
      tls: {},
    });
  });

  it("fromUrl defaults port to 6379 when omitted", () => {
    const opts = RedisConnectionOptionsFactory.fromUrl("redis://localhost");
    expect(opts).toMatchObject({ host: "localhost", port: 6379 });
  });

  it("fromUrl rejects unsupported protocols", () => {
    expect(() => RedisConnectionOptionsFactory.fromUrl("http://127.0.0.1:6379")).toThrow(
      /Unsupported redis URL protocol/,
    );
  });

  it("fromConfig object form matches fromUrl for an equivalent redis:// URL", () => {
    const fromUrl = RedisConnectionOptionsFactory.fromUrl("redis://user:pass@host:9/1");
    const fromCfg = RedisConnectionOptionsFactory.fromConfig({
      host: "host",
      port: 9,
      username: "user",
      password: "pass",
      db: 1,
    });
    expect(fromCfg).toEqual(fromUrl);
  });
});
