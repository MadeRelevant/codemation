import { injectAll,injectable } from "@codemation/core";
import type { Command } from "../../application/bus/Command";
import type { CommandBus } from "../../application/bus/CommandBus";
import type { CommandHandler } from "../../application/bus/CommandHandler";
import { ApplicationTokens } from "../../applicationTokens";
import { commandHandlerMetadataKey } from "./HandlesCommand";

type CommandType = abstract new (...args: any[]) => Command<unknown>;

@injectable()
export class InMemoryCommandBus implements CommandBus {
  private readonly handlersByCommandType: ReadonlyMap<CommandType, CommandHandler<Command<unknown>, unknown>>;

  constructor(
    @injectAll(ApplicationTokens.CommandHandler)
    handlers: ReadonlyArray<CommandHandler<Command<unknown>, unknown>>,
  ) {
    this.handlersByCommandType = this.createHandlersByCommandType(handlers);
  }

  async execute<TResult>(command: Command<TResult>): Promise<TResult> {
    const handler = this.handlersByCommandType.get(command.constructor as CommandType);
    if (!handler) {
      throw new Error(`No command handler registered for ${command.constructor.name}`);
    }
    return (await handler.execute(command as Command<unknown>)) as TResult;
  }

  private createHandlersByCommandType(
    handlers: ReadonlyArray<CommandHandler<Command<unknown>, unknown>>,
  ): ReadonlyMap<CommandType, CommandHandler<Command<unknown>, unknown>> {
    const handlersByCommandType = new Map<CommandType, CommandHandler<Command<unknown>, unknown>>();
    for (const handler of handlers) {
      const commandType = Reflect.getMetadata(commandHandlerMetadataKey, handler.constructor) as CommandType | undefined;
      if (!commandType) {
        throw new Error(`Command handler ${handler.constructor.name} is missing @HandlesCommand metadata.`);
      }
      if (handlersByCommandType.has(commandType)) {
        throw new Error(`Duplicate command handler registered for ${commandType.name}.`);
      }
      handlersByCommandType.set(commandType, handler);
    }
    return handlersByCommandType;
  }
}
