import type { RunEventSubscription } from "@codemation/core";

import IORedis from "ioredis";



export class RedisRunEventSubscription implements RunEventSubscription {
  constructor(
    private readonly subscriber: IORedis,
    private readonly channel: string,
    private readonly handler: (channel: string, message: string) => void,
  ) {}

  async close(): Promise<void> {
    this.subscriber.off("message", this.handler);
    await this.subscriber.unsubscribe(this.channel);
    this.subscriber.disconnect();
  }
}
