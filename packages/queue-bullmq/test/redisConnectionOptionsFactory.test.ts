import { describe, expect, it } from "vitest";

import { RedisConnectionOptionsFactory } from "../src/redisConnection";

describe("RedisConnectionOptionsFactory", () => {
  it("sets maxRetriesPerRequest null for BullMQ + ioredis (blocking commands)", () => {
    const opts = RedisConnectionOptionsFactory.fromConfig({ url: "redis://127.0.0.1:6379" });
    expect(opts.maxRetriesPerRequest).toBeNull();
  });
});
