import type { Logger, LoggerFactory } from "../../application/logging/Logger";

class BrowserLogger implements Logger {
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

export class BrowserLoggerFactory implements LoggerFactory {
  create(scope: string): Logger {
    return new BrowserLogger(scope);
  }
}
