import type { RunEvent, RunEventBus, RunEventSubscription, WorkflowId } from "@codemation/core";
import IORedis from "ioredis";

export class RedisRunEventBus implements RunEventBus {
  private readonly globalChannel: string;
  private publisher: IORedis | undefined;

  constructor(
    private readonly redisUrl: string,
    channelPrefix = "codemation",
  ) {
    this.globalChannel = `${channelPrefix}.run-events.all`;
    this.channelPrefix = `${channelPrefix}.run-events.workflow`;
  }

  private readonly channelPrefix: string;

  async publish(event: RunEvent): Promise<void> {
    const pub = this.ensurePublisher();
    const serialized = JSON.stringify(event);
    await pub.publish(this.globalChannel, serialized);
    await pub.publish(this.getWorkflowChannel(event.workflowId), serialized);
  }

  async subscribe(onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    return await this.createSubscription(this.globalChannel, onEvent);
  }

  async subscribeToWorkflow(workflowId: WorkflowId, onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    return await this.createSubscription(this.getWorkflowChannel(workflowId), onEvent);
  }

  private ensurePublisher(): IORedis {
    if (this.publisher) return this.publisher;
    this.publisher = new IORedis(this.redisUrl);
    return this.publisher;
  }

  private async createSubscription(channel: string, onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    const sub = new IORedis(this.redisUrl);
    const onMessage = (receivedChannel: string, message: string) => {
      if (receivedChannel !== channel) return;
      onEvent(this.parseEvent(message));
    };

    sub.on("message", onMessage);
    await sub.subscribe(channel);
    return new RedisRunEventSubscription(sub, channel, onMessage);
  }

  private getWorkflowChannel(workflowId: WorkflowId): string {
    return `${this.channelPrefix}.${workflowId}`;
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
    this.subscriber.disconnect();
  }
}

