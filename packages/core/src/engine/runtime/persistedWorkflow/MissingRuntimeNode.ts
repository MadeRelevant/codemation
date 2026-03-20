import type { Items,Node,NodeOutputs } from "../../../types";
import { MissingRuntimeNodeConfig } from "./MissingRuntimeNodeConfig";

export class MissingRuntimeNode implements Node<MissingRuntimeNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items): Promise<NodeOutputs> {
    return { main: items };
  }
}
