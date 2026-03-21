import type { Command } from "./Command";

export interface CommandBus {
  execute<TResult>(command: Command<TResult>): Promise<TResult>;
}
