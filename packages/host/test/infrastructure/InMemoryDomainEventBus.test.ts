import { describe, expect, it } from "vitest";
import "reflect-metadata";
import { InMemoryDomainEventBus } from "../../src/infrastructure/di/InMemoryDomainEventBus";
import { DomainEvent } from "../../src/application/bus/DomainEvent";
import { DomainEventHandler } from "../../src/application/bus/DomainEventHandler";
import { domainEventHandlerMetadataKey } from "../../src/infrastructure/di/HandlesDomainEventRegistry";

class TestEvent extends DomainEvent {
  constructor(public readonly value: string) {
    super();
  }
}

class OtherEvent extends DomainEvent {}

class TestEventHandler extends DomainEventHandler<TestEvent> {
  readonly received: string[] = [];
  async handle(event: TestEvent): Promise<void> {
    this.received.push(event.value);
  }
}

function makeHandler(eventType: abstract new (...args: never[]) => DomainEvent): TestEventHandler {
  const handler = new TestEventHandler();
  Reflect.defineMetadata(domainEventHandlerMetadataKey, eventType, handler.constructor);
  return handler;
}

function makeBus(handlers: DomainEventHandler<DomainEvent>[]): InMemoryDomainEventBus {
  return new InMemoryDomainEventBus(handlers);
}

describe("InMemoryDomainEventBus", () => {
  it("publishes event to registered handler", async () => {
    const handler = makeHandler(TestEvent);
    const bus = makeBus([handler]);
    await bus.publish(new TestEvent("hello"));
    expect(handler.received).toEqual(["hello"]);
  });

  it("does not call handler for unrelated event", async () => {
    const handler = makeHandler(TestEvent);
    const bus = makeBus([handler]);
    await bus.publish(new OtherEvent());
    expect(handler.received).toHaveLength(0);
  });

  it("calls multiple handlers for the same event type", async () => {
    const handler1 = makeHandler(TestEvent);
    const handler2 = makeHandler(TestEvent);
    const bus = makeBus([handler1, handler2]);
    await bus.publish(new TestEvent("multi"));
    expect(handler1.received).toEqual(["multi"]);
    expect(handler2.received).toEqual(["multi"]);
  });

  it("throws when handler is missing @HandlesDomainEvent metadata", () => {
    class BareHandler extends DomainEventHandler<TestEvent> {
      async handle(_event: TestEvent): Promise<void> {}
    }
    const bare = new BareHandler();
    // Metadata NOT set on BareHandler
    expect(() => makeBus([bare])).toThrow("missing @HandlesDomainEvent metadata");
  });

  it("works with empty handlers list", async () => {
    const bus = makeBus([]);
    await expect(bus.publish(new TestEvent("x"))).resolves.toBeUndefined();
  });
});
