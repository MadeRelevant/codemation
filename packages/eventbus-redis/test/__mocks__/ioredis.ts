/**
 * In-process pub/sub fake replacing ioredis for unit tests.
 * Vitest resolves this via the `alias` in vitest.config.ts — no vi.mock() required.
 */
import { EventEmitter } from "node:events";

class FakeBroker {
  private static readonly channels = new Map<string, Array<(channel: string, message: string) => void>>();

  static publish(channel: string, message: string): void {
    const handlers = this.channels.get(channel);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      handler(channel, message);
    }
  }

  static subscribe(channel: string, handler: (channel: string, message: string) => void): void {
    const existing = this.channels.get(channel) ?? [];
    existing.push(handler);
    this.channels.set(channel, existing);
  }

  static unsubscribe(channel: string, handler: (channel: string, message: string) => void): void {
    const existing = this.channels.get(channel) ?? [];
    this.channels.set(
      channel,
      existing.filter((h) => h !== handler),
    );
  }

  static reset(): void {
    this.channels.clear();
  }
}

class FakeRedis extends EventEmitter {
  // Track bound message handlers so we can remove them on unsubscribe
  private readonly boundHandlers = new Map<string, (channel: string, message: string) => void>();

  constructor(_url: string) {
    super();
  }

  async publish(channel: string, message: string): Promise<number> {
    FakeBroker.publish(channel, message);
    return 1;
  }

  async subscribe(channel: string): Promise<void> {
    const handler = (ch: string, msg: string) => {
      this.emit("message", ch, msg);
    };
    this.boundHandlers.set(channel, handler);
    FakeBroker.subscribe(channel, handler);
  }

  async unsubscribe(channel: string): Promise<void> {
    const handler = this.boundHandlers.get(channel);
    if (handler) {
      FakeBroker.unsubscribe(channel, handler);
      this.boundHandlers.delete(channel);
    }
  }

  disconnect(): void {
    // no-op
  }
}

// Reset shared broker state before each test module is imported
FakeBroker.reset();

export default FakeRedis;
export { FakeRedis, FakeBroker };
