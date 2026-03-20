import type { Logger } from "../../application/logging/Logger";



export class ServerLogger implements Logger {
  constructor(private readonly scope: string) {}

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

  private log(level: "info" | "warn" | "error" | "debug", message: string, exception?: Error): void {
    const prefix = `[${this.scope}]`;
    if (exception) {
      console[level](`${prefix} ${message}`, exception);
      return;
    }
    console[level](`${prefix} ${message}`);
  }
}
