import type { StartupSummaryLogger } from "./startupSummaryTypes";
import { injectable } from "@codemation/core";

@injectable()
export class ConsoleStartupSummaryLogger implements StartupSummaryLogger {
  info(message: string): void {
    console.info(message);
  }
}
