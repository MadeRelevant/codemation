import type { NodeResolver } from "../types";

import { NodeInstanceFactory } from "./NodeInstanceFactory";

export class NodeInstanceFactoryFactory {
  create(nodeResolver: NodeResolver): NodeInstanceFactory {
    return new NodeInstanceFactory(nodeResolver);
  }
}
