import type { Logger, LoggerFactory } from "../../src/application/logging/Logger";

/**
 * Logger that discards all output. Useful when a Logger is required but log
 * content is irrelevant to the test.
 */
export class SilentLogger implements Logger {
  info(_message: string, _exception?: Error): void {}
  warn(_message: string, _exception?: Error): void {}
  error(_message: string, _exception?: Error): void {}
  debug(_message: string, _exception?: Error): void {}
}

/**
 * Logger that records all calls so tests can assert on log output.
 */
export class CapturingLogger implements Logger {
  readonly infos: string[] = [];
  readonly warns: string[] = [];
  readonly errors: string[] = [];
  readonly debugs: string[] = [];

  info(message: string, _exception?: Error): void {
    this.infos.push(message);
  }
  warn(message: string, _exception?: Error): void {
    this.warns.push(message);
  }
  error(message: string, _exception?: Error): void {
    this.errors.push(message);
  }
  debug(message: string, _exception?: Error): void {
    this.debugs.push(message);
  }
}

/**
 * LoggerFactory that returns the same CapturingLogger for every scope.
 * Inspect `.logger` to assert on logged output.
 */
export class FakeLoggerFactory implements LoggerFactory {
  readonly logger = new CapturingLogger();

  create(_scope: string): Logger {
    return this.logger;
  }
}
