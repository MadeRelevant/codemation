import type {
Items
} from "../../types";





export class RootNodeInputResolver {
  resolve(args: { nodeKind: "node" | "trigger"; items?: Items }): Items {
    if (args.items) {
      return args.items;
    }
    if (args.nodeKind === "trigger") {
      return [];
    }
    return [{ json: {} }];
  }
}
