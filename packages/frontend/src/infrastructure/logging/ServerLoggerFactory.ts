import type { Logger,LoggerFactory } from "../../application/logging/Logger";

import { ServerLogger } from "./ServerLogger";

export class ServerLoggerFactory implements LoggerFactory {
  create(scope: string): Logger {
    return new ServerLogger(scope);
  }
}

export { ServerLogger } from "./ServerLogger";
