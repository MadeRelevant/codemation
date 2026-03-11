import assert from "node:assert/strict";
import test from "node:test";
import type { Items, Node, NodeExecutionContext, NodeOutputs, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { Callback, If, ManualTrigger, MapData, Wait, createWorkflowBuilder } from "@codemation/core-nodes";

type AssertTrue<T extends true> = T;
type IsExact<TLeft, TRight> = [TLeft] extends [TRight] ? ([TRight] extends [TLeft] ? true : false) : false;

type SeedJson = Readonly<{
  subject: string;
  count: number;
}>;

type EnrichedJson = SeedJson &
  Readonly<{
    upperSubject: string;
  }>;

class RequiresExplicitInputNode<TItemJson> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = RequiresExplicitInputNodeRunner;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}
}

class RequiresExplicitInputNodeRunner implements Node<RequiresExplicitInputNode<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items, _ctx: NodeExecutionContext<RequiresExplicitInputNode<any>>): Promise<NodeOutputs> {
    return { main: items };
  }
}

test("workflow builder preserves item json inference across then and when", () => {
  const workflow = createWorkflowBuilder({ id: "wf.typing", name: "Typing" })
    .trigger(new ManualTrigger<SeedJson>("Manual trigger"))
    .then(
      new MapData<SeedJson, EnrichedJson>("Enrich", (item) => ({
        ...item.json,
        upperSubject: item.json.subject.toUpperCase(),
      })),
    )
    .then(
      new Callback<EnrichedJson>("Capture", (items) => {
        const typedItems: Items<EnrichedJson> = items;
        type CallbackItemsAreTyped = AssertTrue<IsExact<typeof typedItems, Items<EnrichedJson>>>;
        const callbackItemsAreTyped: CallbackItemsAreTyped = true;
        void callbackItemsAreTyped;
        return typedItems;
      }),
    )
    .then(new If<EnrichedJson>("Has count", (item) => item.json.count > 0))
    .when({
      true: [new Wait<EnrichedJson>("Wait", 1)],
      false: [new Wait<EnrichedJson>("Skip", 0)],
    })
    .then(
      new Callback<EnrichedJson>("After merge", (items) => {
        const typedItems: Items<EnrichedJson> = items;
        type AfterMergeItemsAreTyped = AssertTrue<IsExact<typeof typedItems, Items<EnrichedJson>>>;
        const afterMergeItemsAreTyped: AfterMergeItemsAreTyped = true;
        void afterMergeItemsAreTyped;
        return typedItems;
      }),
    )
    .build();

  assert.equal(workflow.id, "wf.typing");
  assert.equal(workflow.nodes.length, 8);
});

test("custom workflow nodes must declare the current item shape when inference is unavailable", () => {
  const chain = createWorkflowBuilder({ id: "wf.custom.typing", name: "Custom typing" })
    .trigger(new ManualTrigger<SeedJson>("Manual trigger"))
    .then(
      new MapData<SeedJson, EnrichedJson>("Enrich", (item) => ({
        ...item.json,
        upperSubject: item.json.subject.toUpperCase(),
      })),
    );

  // @ts-expect-error Missing generic input shape leaves the node incompatible with the current chain items.
  chain.then(new RequiresExplicitInputNode("Missing explicit input type"));

  const typedChain = chain.then(new RequiresExplicitInputNode<EnrichedJson>("Typed input shape"));

  assert.equal(typedChain.build().id, "wf.custom.typing");
});
