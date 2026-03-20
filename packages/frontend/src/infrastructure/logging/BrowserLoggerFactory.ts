import type { Logger,LoggerFactory } from "../../application/logging/Logger";

import { BrowserLogger } from "./BrowserLogger";

export class BrowserLoggerFactory implements LoggerFactory {
  create(scope: string): Logger {
    return new BrowserLogger(scope);
  }
}

export { BrowserLogger } from "./BrowserLogger";
