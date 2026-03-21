import type { DomainEvent } from "./DomainEvent";

export abstract class DomainEventHandler<TEvent extends DomainEvent> {
  abstract handle(event: TEvent): Promise<void>;
}
