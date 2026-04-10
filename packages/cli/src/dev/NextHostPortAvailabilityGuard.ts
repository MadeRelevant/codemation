import process from "node:process";

import type { ListenPortConflictDescriber } from "./ListenPortConflictDescriber";

export class NextHostPortAvailabilityGuard {
  constructor(private readonly portConflictDescriber: ListenPortConflictDescriber) {}

  async assertLoopbackPortAvailable(port: number): Promise<void> {
    const details = await this.portConflictDescriber.describeLoopbackPort(port);
    if (!details) {
      return;
    }
    const message = `[codemation] Next host port ${port} is already in use on 127.0.0.1 (${details}).`;
    process.stdout.write(`\n${message}\n`);
    throw new Error(message);
  }
}
