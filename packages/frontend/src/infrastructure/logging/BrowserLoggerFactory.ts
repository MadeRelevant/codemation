import type { Logger, LoggerFactory } from "../../application/logging/Logger";

import type { LogLevelPolicy } from "./LogLevelPolicy";
import { BrowserLogger } from "./BrowserLogger";

export class BrowserLoggerFactory implements LoggerFactory {
  constructor(private readonly logLevelPolicy: LogLevelPolicy) {}

  create(scope: string): Logger {
    return new BrowserLogger(scope, this.logLevelPolicy);
  }
}

export { BrowserLogger } from "./BrowserLogger";
