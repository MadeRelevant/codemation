import { container as tsyringeContainer, injectable } from "@codemation/core";
import type { DomainEvent } from "../../application/bus/DomainEvent";
import type { DomainEventHandler } from "../../application/bus/DomainEventHandler";
import { ApplicationTokens } from "../../applicationTokens";

type AbstractType<TInstance> = abstract new (...args: any[]) => TInstance;
type ConcreteType<TInstance> = new (...args: any[]) => TInstance;

export const domainEventHandlerMetadataKey = Symbol.for("codemation.infrastructure.di.DomainEventHandler");

export class HandlesDomainEvent {
  static for<TEvent extends DomainEvent>(eventType: AbstractType<TEvent>): ClassDecorator {
    return (target) => {
      Reflect.defineMetadata(domainEventHandlerMetadataKey, eventType, target);
      injectable()(target as never);
      tsyringeContainer.registerSingleton(
        ApplicationTokens.DomainEventHandler as never,
        target as unknown as ConcreteType<DomainEventHandler<DomainEvent>>,
      );
    };
  }
}
