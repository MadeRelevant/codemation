import type { LogFilter } from "../../application/logging/LogFilter";
import type { Logger } from "../../application/logging/Logger";

export class FilteringLogger implements Logger {
  constructor(
    private readonly inner: Logger,
    private readonly scope: string,
    private readonly filter: LogFilter,
  ) {}

  info(message: string, exception?: Error): void {
    if (!this.filter({ scope: this.scope, level: "info", message })) {
      return;
    }
    this.inner.info(message, exception);
  }

  warn(message: string, exception?: Error): void {
    if (!this.filter({ scope: this.scope, level: "warn", message })) {
      return;
    }
    this.inner.warn(message, exception);
  }

  error(message: string, exception?: Error): void {
    if (!this.filter({ scope: this.scope, level: "error", message })) {
      return;
    }
    this.inner.error(message, exception);
  }

  debug(message: string, exception?: Error): void {
    if (!this.filter({ scope: this.scope, level: "debug", message })) {
      return;
    }
    this.inner.debug(message, exception);
  }
}
