import { inject, injectable } from "@codemation/core";

import type { Logger, LoggerFactory } from "../../application/logging/Logger";

import { LogLevelPolicyFactory } from "./LogLevelPolicyFactory";
import { ServerLogger } from "./ServerLogger";

@injectable()
export class ServerLoggerFactory implements LoggerFactory {
  constructor(@inject(LogLevelPolicyFactory) private readonly logLevelPolicyFactory: LogLevelPolicyFactory) {}

  create(scope: string): Logger {
    return new ServerLogger(scope, this.logLevelPolicyFactory.create());
  }
}

export { ServerLogger } from "./ServerLogger";
