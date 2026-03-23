import { injectable,registry } from "@codemation/core";
import type { Command } from "../../application/bus/Command";
import type { CommandHandler } from "../../application/bus/CommandHandler";
import { ApplicationTokens } from "../../applicationTokens";

type AbstractType<TInstance> = abstract new (...args: any[]) => TInstance;
type ConcreteType<TInstance> = new (...args: any[]) => TInstance;

export const commandHandlerMetadataKey = Symbol.for("codemation.infrastructure.di.CommandHandler");

export class HandlesCommand {
  static forCommand<TCommand extends Command<TResult>, TResult>(commandType: AbstractType<TCommand>): ClassDecorator {
    return (target) => {
      Reflect.defineMetadata(commandHandlerMetadataKey, commandType, target);
      injectable()(target as never);
      registry([
        {
          token: ApplicationTokens.CommandHandler,
          useClass: target as unknown as ConcreteType<CommandHandler<Command<unknown>, unknown>>,
        },
      ])(target as never);
    };
  }
}
