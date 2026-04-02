import type { Item, Items, Node, NodeExecutionContext, NodeOutputs } from "@codemation/core";
import { node } from "@codemation/core";

import { pluginDevApiKeySlotKey, type PluginDevHttpDemo, type PluginDevHttpDemoOutputJson } from "./PluginDevHttpDemo";

@node({ packageName: "@codemation/plugin-dev" })
export class PluginDevHttpDemoNode implements Node<PluginDevHttpDemo> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<PluginDevHttpDemo>): Promise<NodeOutputs> {
    const output: Item[] = [];
    for (const item of items) {
      output.push(await this.executeItem(item, ctx));
    }
    return {
      main: output,
    };
  }

  private async executeItem(item: Item, ctx: NodeExecutionContext<PluginDevHttpDemo>): Promise<Item> {
    type PluginDevApiKeySession = Readonly<{ apiKey: string }>;
    const session = await ctx.getCredential<PluginDevApiKeySession>(pluginDevApiKeySlotKey);
    const response = await fetch("https://httpbin.org/headers", {
      headers: {
        "X-Example-Key": session.apiKey,
      },
    });
    const echoedKeyLength = await this.readEchoedKeyLength(response);
    const outJson: PluginDevHttpDemoOutputJson = {
      demoImageUrl: "https://httpbin.org/image/jpeg",
      echoedKeyLength,
      httpStatus: response.status,
    };
    return {
      ...item,
      json: outJson,
    };
  }

  private async readEchoedKeyLength(response: Response): Promise<number> {
    const body = (await response.json()) as { headers?: Record<string, string> };
    const echoed = body.headers?.["X-Example-Key"] ?? body.headers?.["x-example-key"] ?? "";
    return echoed.length;
  }
}
