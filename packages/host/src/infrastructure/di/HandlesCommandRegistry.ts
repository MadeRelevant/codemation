import { injectable } from "@codemation/core";
import type { Command } from "../../application/bus/Command";

type AbstractType<TInstance> = abstract new (...args: any[]) => TInstance;

export const commandHandlerMetadataKey = Symbol.for("codemation.infrastructure.di.CommandHandler");

export class HandlesCommand {
  static forCommand<TCommand extends Command<TResult>, TResult>(commandType: AbstractType<TCommand>): ClassDecorator {
    return (target) => {
      Reflect.defineMetadata(commandHandlerMetadataKey, commandType, target);
      injectable()(target as never);
    };
  }
}
