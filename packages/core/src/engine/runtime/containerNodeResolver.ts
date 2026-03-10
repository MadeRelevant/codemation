import type { Container, TypeToken } from "../../di";
import type { NodeResolver } from "../../types";

export class ContainerNodeResolver implements NodeResolver {
  constructor(private readonly container: Container) {}

  resolve(token: TypeToken<unknown>): unknown {
    return this.container.resolve(token);
  }

  getContainer(): Container {
    return this.container;
  }
}
