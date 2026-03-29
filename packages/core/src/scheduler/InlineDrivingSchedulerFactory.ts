import { NodeExecutor } from "../execution/NodeExecutor";

import { InlineDrivingScheduler } from "./InlineDrivingScheduler";

export class InlineDrivingSchedulerFactory {
  create(nodeExecutor: NodeExecutor): InlineDrivingScheduler {
    return new InlineDrivingScheduler(nodeExecutor);
  }
}
