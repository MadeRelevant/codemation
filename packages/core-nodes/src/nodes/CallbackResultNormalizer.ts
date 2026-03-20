import type { Items,NodeOutputs } from "@codemation/core";




export class CallbackResultNormalizer {
  static toNodeOutputs(result: Items | void, items: Items): NodeOutputs {
    return { main: result ?? items };
  }
}
