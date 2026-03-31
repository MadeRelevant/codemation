import { DevRebuildQueue, type DevRebuildHandler } from "./DevRebuildQueue";

export class DevRebuildQueueFactory {
  create(handler: DevRebuildHandler): DevRebuildQueue {
    return new DevRebuildQueue(handler);
  }
}
