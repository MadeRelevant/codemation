import { inject, injectable } from "@codemation/core";

import type { LogFilter } from "../../application/logging/LogFilter";
import type { Logger, LoggerFactory } from "../../application/logging/Logger";

import { FilteringLogger } from "./FilteringLogger";
import { LogLevelPolicyFactory } from "./LogLevelPolicyFactory";
import { performanceLogPolicyFactory } from "./PerformanceLogPolicyFactory";
import { ServerLogger } from "./ServerLogger";

@injectable()
export class ServerLoggerFactory implements LoggerFactory {
  constructor(@inject(LogLevelPolicyFactory) private readonly logLevelPolicyFactory: LogLevelPolicyFactory) {}

  create(scope: string): Logger {
    return new ServerLogger(scope, this.logLevelPolicyFactory.create());
  }

  createFiltered(scope: string, filter: LogFilter): Logger {
    return new FilteringLogger(this.create(scope), scope, filter);
  }

  createPerformanceDiagnostics(scope: string): Logger {
    return this.createFiltered(scope, (_entry) => performanceLogPolicyFactory.create().shouldEmitDetailedTiming());
  }
}

export { ServerLogger } from "./ServerLogger";
