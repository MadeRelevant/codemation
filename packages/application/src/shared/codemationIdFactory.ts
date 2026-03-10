import { injectable } from "@codemation/core";

@injectable()
export class CodemationIdFactory {
  makeRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  makeActivationId(): string {
    return `act_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}
