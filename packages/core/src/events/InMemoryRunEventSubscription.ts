
import type { RunEventSubscription } from "./runEvents";



export class InMemoryRunEventSubscription implements RunEventSubscription {
  constructor(private readonly onClose: () => void) {}

  async close(): Promise<void> {
    this.onClose();
  }
}
