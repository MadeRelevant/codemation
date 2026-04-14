import type { RunnableNodeConfig } from "../types";

type BinaryKeepingRunnableNodeConfig = RunnableNodeConfig & Readonly<{
  keepBinaries?: boolean;
}>;

export type RunnableOutputBehavior = Readonly<{
  keepBinaries: boolean;
}>;

export class RunnableOutputBehaviorResolver {
  resolve(config: RunnableNodeConfig): RunnableOutputBehavior {
    return {
      keepBinaries: this.isKeepBinariesEnabled(config),
    };
  }

  private isKeepBinariesEnabled(config: RunnableNodeConfig): boolean {
    const candidate = config as BinaryKeepingRunnableNodeConfig;
    return candidate.keepBinaries === true;
  }
}
