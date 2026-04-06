/**
 * Deterministic `run_1`, `act_1`-style ids for test harness factories.
 */
export class PrefixedSequentialIdGenerator {
  private n = 0;

  constructor(private readonly prefix: string) {}

  next(): string {
    this.n += 1;
    return `${this.prefix}${this.n}`;
  }

  asFn(): () => string {
    return () => this.next();
  }
}
