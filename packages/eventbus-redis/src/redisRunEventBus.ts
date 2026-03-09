import type { RunEvent, RunEventBus, RunEventSubscription } from "@codemation/core";
import IORedis from "ioredis";

export class RedisRunEventBus implements RunEventBus {
  private readonly channel: string;
  private publisher: IORedis | undefined;
  private subscriber: IORedis | undefined;

  constructor(
    private readonly redisUrl: string,
    channelPrefix = "codemation",
  ) {
    this.channel = `${channelPrefix}.run-events`;
  }

  async publish(event: RunEvent): Promise<void> {
    const pub = this.ensurePublisher();
    await pub.publish(this.channel, JSON.stringify(event));
  }

  async subscribe(onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    const sub = this.ensureSubscriber();

    const onMessage = (channel: string, message: string) => {
      if (channel !== this.channel) return;
      const event = this.parseEvent(message);
      onEvent(event);
    };

    sub.on("message", onMessage);
    await sub.subscribe(this.channel);

    return new RedisRunEventSubscription(sub, this.channel, onMessage);
  }

  private ensurePublisher(): IORedis {
    if (this.publisher) return this.publisher;
    this.publisher = new IORedis(this.redisUrl);
    return this.publisher;
  }

  private ensureSubscriber(): IORedis {
    if (this.subscriber) return this.subscriber;
    this.subscriber = new IORedis(this.redisUrl);
    return this.subscriber;
  }

  private parseEvent(raw: string): RunEvent {
    return JSON.parse(raw) as RunEvent;
  }
}

class RedisRunEventSubscription implements RunEventSubscription {
  constructor(
    private readonly subscriber: IORedis,
    private readonly channel: string,
    private readonly handler: (channel: string, message: string) => void,
  ) {}

  async close(): Promise<void> {
    this.subscriber.off("message", this.handler);
    await this.subscriber.unsubscribe(this.channel);
  }
}

