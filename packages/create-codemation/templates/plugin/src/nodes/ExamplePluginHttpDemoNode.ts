import type { Item, Items, Node, NodeExecutionContext, NodeOutputs } from "@codemation/core";
import { node } from "@codemation/core";

import {
  examplePluginApiKeySlotKey,
  type ExamplePluginHttpDemo,
  type ExamplePluginHttpDemoOutputJson,
} from "./ExamplePluginHttpDemo";

@node({ packageName: "codemation-plugin" })
export class ExamplePluginHttpDemoNode implements Node<ExamplePluginHttpDemo> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<ExamplePluginHttpDemo>): Promise<NodeOutputs> {
    const output: Item[] = [];
    for (const item of items) {
      output.push(await this.executeItem(item, ctx));
    }
    return {
      main: output,
    };
  }

  private async executeItem(item: Item, ctx: NodeExecutionContext<ExamplePluginHttpDemo>): Promise<Item> {
    type ExampleApiKeySession = Readonly<{ apiKey: string }>;
    const session = await ctx.getCredential<ExampleApiKeySession>(examplePluginApiKeySlotKey);
    const response = await fetch("https://httpbin.org/headers", {
      headers: {
        "X-Example-Key": session.apiKey,
      },
    });
    const echoedKeyLength = await this.readEchoedKeyLength(response);
    const outJson: ExamplePluginHttpDemoOutputJson = {
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
