import type { Item, NodeOutputs } from "@codemation/core";

export class AgentOutputFactory {
  static fromUnknown(value: unknown): NodeOutputs {
    return { main: [{ json: value }] };
  }

  static replaceJson(item: Item, value: unknown): Item {
    return {
      ...item,
      json: value,
    };
  }

  static fromAgentContent(content: string): unknown {
    try {
      return JSON.parse(content) as unknown;
    } catch {
      return { output: content };
    }
  }
}
