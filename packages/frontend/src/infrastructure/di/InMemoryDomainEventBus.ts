import { injectAll,injectable } from "@codemation/core";
import type { DomainEvent } from "../../application/bus/DomainEvent";
import type { DomainEventBus } from "../../application/bus/DomainEventBus";
import type { DomainEventHandler } from "../../application/bus/DomainEventHandler";
import { ApplicationTokens } from "../../applicationTokens";
import { domainEventHandlerMetadataKey } from "./HandlesDomainEvent";

type DomainEventType = abstract new (...args: any[]) => DomainEvent;

@injectable()
export class InMemoryDomainEventBus implements DomainEventBus {
  private readonly handlersByEventType: ReadonlyMap<DomainEventType, ReadonlyArray<DomainEventHandler<DomainEvent>>>;

  constructor(
    @injectAll(ApplicationTokens.DomainEventHandler)
    handlers: ReadonlyArray<DomainEventHandler<DomainEvent>>,
  ) {
    this.handlersByEventType = this.createHandlersByEventType(handlers);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlersByEventType.get(event.constructor as DomainEventType) ?? [];
    for (const handler of handlers) {
      await handler.handle(event);
    }
  }

  private createHandlersByEventType(
    handlers: ReadonlyArray<DomainEventHandler<DomainEvent>>,
  ): ReadonlyMap<DomainEventType, ReadonlyArray<DomainEventHandler<DomainEvent>>> {
    const handlersByEventType = new Map<DomainEventType, Array<DomainEventHandler<DomainEvent>>>();
    for (const handler of handlers) {
      const eventType = Reflect.getMetadata(domainEventHandlerMetadataKey, handler.constructor) as DomainEventType | undefined;
      if (!eventType) {
        throw new Error(`Domain event handler ${handler.constructor.name} is missing @HandlesDomainEvent metadata.`);
      }
      const currentHandlers = handlersByEventType.get(eventType) ?? [];
      currentHandlers.push(handler);
      handlersByEventType.set(eventType, currentHandlers);
    }
    return new Map([...handlersByEventType.entries()].map(([eventType, eventHandlers]) => [eventType, [...eventHandlers]] as const));
  }
}
