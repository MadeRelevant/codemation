import type { Items, RunnableNode, RunnableNodeConfig, RunnableNodeExecuteArgs, TypeToken } from "@codemation/core";
import { emitPorts } from "@codemation/core";
import { defineNode } from "@codemation/core";
import { itemValue } from "@codemation/core";
import { Callback, If, ManualTrigger, MapData, Wait, createWorkflowBuilder, workflow } from "@codemation/core-nodes";
import { AIAgent } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

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
  readonly type: TypeToken<unknown> = RequiresExplicitInputNodeRunner;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}
}

class RequiresExplicitInputNodeRunner implements RunnableNode<RequiresExplicitInputNode<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<RequiresExplicitInputNode<any>>): unknown {
    return args.item;
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
  assert.equal(workflow.nodes.length, 7);
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

test("workflow helper preserves inference across map, if, wait, agent, and helper node usage", () => {
  const helperNode = defineNode({
    key: "workflowTyping.helperUppercase",
    title: "Helper uppercase",
    input: {
      field: "string",
    },
    execute({ input }, { config }) {
      const _typedField: string = config.field;
      type FieldIsString = AssertTrue<IsExact<typeof _typedField, string>>;
      const fieldIsString: FieldIsString = true;
      void fieldIsString;

      return {
        ...input,
        [config.field]: String(input[config.field as keyof typeof input] ?? "").toUpperCase(),
      };
    },
  });

  const built = workflow("wf.helper.typing")
    .name("Workflow helper typing")
    .manualTrigger({
      subject: "hello",
      count: 1,
    })
    .map("Enrich", (item) => {
      const _typedSubject: string = item.subject;
      type SubjectIsString = AssertTrue<IsExact<typeof _typedSubject, string>>;
      const subjectIsString: SubjectIsString = true;
      void subjectIsString;
      return {
        ...item,
        upperSubject: item.subject.toUpperCase(),
      };
    })
    .if("Has count", (item) => item.count > 0, {
      true: (branch) =>
        branch.wait("2s").map((item) => ({
          ...item,
          route: "sales" as const,
        })),
      false: (branch) =>
        branch.wait("Skip", 0).map((item) => ({
          ...item,
          route: "sales" as const,
        })),
    })
    .agent("Summarize", {
      messages: itemValue(({ item }) => [
        {
          role: "system",
          content: 'Return strict JSON only: {"summary": string}',
        },
        {
          role: "user",
          content: `${item.json.subject}:${item.json.route}`,
        },
      ]),
      model: "openai:gpt-4o-mini",
      outputSchema: z.object({
        summary: z.string(),
      }),
    })
    .node(helperNode, { field: "summary" })
    .build();

  assert.equal(built.id, "wf.helper.typing");
  assert.equal(built.nodes.length, 9);
});

test("workflow helper forwards agent outputSchema into the built AIAgent config", () => {
  const outputSchema = z.object({
    summary: z.string(),
  });
  const built = workflow("wf.helper.agent-output-schema")
    .name("Workflow helper structured agent")
    .manualTrigger({
      subject: "hello",
    })
    .agent("Summarize", {
      messages: itemValue(({ item }) => [
        {
          role: "user",
          content: item.json.subject,
        },
      ]),
      model: "openai:gpt-4o-mini",
      outputSchema,
    })
    .build();

  const agentNode = built.nodes.find((node) => node.config instanceof AIAgent);
  assert.ok(agentNode);
  const agentConfig = agentNode.config as AIAgent<{ subject: string }, { summary: string }>;
  assert.ok(agentConfig.outputSchema === outputSchema);
});

test("workflow helper supports callback routing plus merge and switch core nodes", () => {
  const built = workflow("wf.helper.route-merge-switch")
    .name("Workflow helper route merge switch")
    .manualTrigger({
      subject: "hello",
      count: 1,
    })
    .then(
      new Callback<SeedJson>(
        "Route review",
        (items) =>
          emitPorts({
            main: items.filter((item) => item.json.count > 0),
            error: items.filter((item) => item.json.count <= 0),
          }),
        {
          id: "route_review",
          declaredOutputPorts: ["main", "error"],
        },
      ),
    )
    .route({
      error: (branch) => branch.wait("Ignore errors", 0, "ignore_errors"),
      main: (branch) =>
        branch
          .if("Has count", (item) => item.count > 0, {
            true: (trueBranch) =>
              trueBranch.map(
                "Route sales",
                (item) => ({
                  ...item,
                  route: "sales" as const,
                }),
                "route_sales",
              ),
            false: (falseBranch) =>
              falseBranch.map(
                "Route support",
                (item) => ({
                  ...item,
                  route: "support" as const,
                }),
                "route_support",
              ),
          })
          .merge("Merge branches", { mode: "append", prefer: ["true", "false"] }, "merge_routes")
          .switch(
            "Route team",
            {
              cases: ["sales"],
              defaultCase: "support",
              resolveCaseKey: (item) => item.route,
              branches: {
                sales: (salesBranch) => salesBranch.wait("Sales wait", 1, "wait_sales"),
                support: (supportBranch) => supportBranch.wait("Support wait", 0, "wait_support"),
              },
            },
            "switch_route",
          ),
    })
    .build();

  assert.equal(built.id, "wf.helper.route-merge-switch");
  assert.ok(built.edges.some((edge) => edge.from.output === "true" && edge.to.nodeId === "route_sales"));
  assert.ok(
    built.edges.some(
      (edge) => edge.from.nodeId === "route_sales" && edge.to.nodeId === "merge_routes" && edge.to.input === "true",
    ),
  );
  assert.ok(
    built.edges.some(
      (edge) => edge.from.nodeId === "route_support" && edge.to.nodeId === "merge_routes" && edge.to.input === "false",
    ),
  );
  assert.ok(
    built.edges.some(
      (edge) => edge.from.nodeId === "switch_route" && edge.from.output === "sales" && edge.to.nodeId === "wait_sales",
    ),
  );
  assert.ok(
    built.edges.some(
      (edge) =>
        edge.from.nodeId === "switch_route" && edge.from.output === "support" && edge.to.nodeId === "wait_support",
    ),
  );
});
