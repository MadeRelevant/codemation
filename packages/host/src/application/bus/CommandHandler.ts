import type { Command } from "./Command";

export abstract class CommandHandler<TCommand extends Command<TResult>, TResult> {
  abstract execute(command: TCommand): Promise<TResult>;
}
