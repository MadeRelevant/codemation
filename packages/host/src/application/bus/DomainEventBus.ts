import type { DomainEvent } from "./DomainEvent";

export interface DomainEventBus {
  publish(event: DomainEvent): Promise<void>;
}
