import type { RunIdFactory } from "../types";

/**
 * @internal Test harness id factory shared by registrar kit wiring.
 */
export class EngineTestKitRunIdFactory implements RunIdFactory {
  private runCounter = 0;
  private activationCounter = 0;

  constructor(
    private readonly makeRunIdValue: () => string,
    private readonly makeActivationIdValue: () => string,
  ) {}

  makeRunId(): string {
    this.runCounter += 1;
    return this.makeRunIdValue();
  }

  makeActivationId(): string {
    this.activationCounter += 1;
    return this.makeActivationIdValue();
  }
}
