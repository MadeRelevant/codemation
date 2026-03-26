import type { Logger } from "../../application/logging/Logger";
import type { LogLevelPolicy } from "./LogLevelPolicy";

export class ConsoleLogger implements Logger {
  constructor(
    private readonly scope: string,
    private readonly logLevelPolicy: LogLevelPolicy,
  ) {}

  info(message: string, exception?: Error): void {
    this.log("info", message, exception);
  }

  warn(message: string, exception?: Error): void {
    this.log("warn", message, exception);
  }

  error(message: string, exception?: Error): void {
    this.log("error", message, exception);
  }

  debug(message: string, exception?: Error): void {
    this.log("debug", message, exception);
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private log(level: "info" | "warn" | "error" | "debug", message: string, exception?: Error): void {
    if (!this.logLevelPolicy.shouldEmit(level, this.scope)) {
      return;
    }
    const line = `[${level}][${this.scope}][${this.formatTimestamp()}]: ${message}`;
    if (exception) {
      console[level](line, exception);
      return;
    }
    console[level](line);
  }
}
