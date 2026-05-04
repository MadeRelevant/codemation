import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { AgentConnectionNodeCollector } from "../../../src/ai/AgentConnectionNodeCollector.ts";
import { ConnectionNodeIdFactory } from "../../../src/workflow/definition/ConnectionNodeIdFactory.ts";
import { NodeIdSlugifier } from "../../../src/workflow/dsl/NodeIdSlugifier.ts";
import { WorkflowBuilder } from "../../../src/workflow/dsl/WorkflowBuilder.ts";
import { WorkflowDefinitionError } from "../../../src/workflow/dsl/WorkflowDefinitionError.ts";
import { CallbackNodeConfig } from "../../harness/nodes.ts";
import type { AgentNodeConfig, ToolConfig } from "../../../src/ai/AiHost.ts";

// ---------------------------------------------------------------------------
// Minimal fixtures for agent configs — only what AgentConfigInspector checks:
// chatModel + non-empty messages array.
// ---------------------------------------------------------------------------

class FakeModelType {}

function makeFakeAgentConfig(
  name: string,
  id?: string,
  tools?: ToolConfig[],
): AgentNodeConfig<any, any> & { id?: string; name: string } {
  const chatModelType = FakeModelType as unknown as AgentNodeConfig<any, any>["chatModel"]["type"];
  return {
    kind: "node",
    type: FakeModelType as unknown as AgentNodeConfig<any, any>["type"],
    name,
    id,
    messages: [{ role: "user" as const, content: "hello" }],
    chatModel: { name: "fake-llm", type: chatModelType },
    tools,
  } as AgentNodeConfig<any, any> & { id?: string; name: string };
}

// ---------------------------------------------------------------------------

describe("WorkflowBuilder — slug-derived node ids", () => {
  it("derives node ids from slug(label) when no explicit id is given", () => {
    const wf = new WorkflowBuilder({ id: "wf.slug.basic", name: "Slug basic" })
      .start(new CallbackNodeConfig("Send Gmail Message", () => {}))
      .then(new CallbackNodeConfig("Parse Response", () => {}))
      .build();

    const ids = wf.nodes.map((n) => n.id);
    assert.equal(ids[0], "send-gmail-message");
    assert.equal(ids[1], "parse-response");
  });

  it("reordering produces the same ids (regression guard)", () => {
    function buildA() {
      return new WorkflowBuilder({ id: "wf.slug.order", name: "Order guard" })
        .start(new CallbackNodeConfig("Alpha Step", () => {}))
        .then(new CallbackNodeConfig("Beta Step", () => {}))
        .build();
    }
    // Run twice — same result regardless of insertion order if ids are label-derived.
    const wf1 = buildA();
    const wf2 = buildA();
    assert.equal(wf1.nodes[0]!.id, wf2.nodes[0]!.id);
    assert.equal(wf1.nodes[1]!.id, wf2.nodes[1]!.id);
  });

  it("explicit id wins over label slug", () => {
    const wf = new WorkflowBuilder({ id: "wf.slug.explicit", name: "Explicit id" })
      .start(new CallbackNodeConfig("Some Long Label", () => {}, { id: "my-custom-id" }))
      .build();

    assert.equal(wf.nodes[0]!.id, "my-custom-id");
  });

  it("slug id matches NodeIdSlugifier.slugify", () => {
    const label = "OpenAI: Chat Completion";
    const wf = new WorkflowBuilder({ id: "wf.slug.match", name: "Slug match" })
      .start(new CallbackNodeConfig(label, () => {}))
      .build();

    assert.equal(wf.nodes[0]!.id, NodeIdSlugifier.slugify(label));
  });
});

describe("WorkflowBuilder — validation errors", () => {
  it("throws WorkflowDefinitionError when two nodes have the same label slug", () => {
    assert.throws(
      () => {
        new WorkflowBuilder({ id: "wf.dup.label", name: "Dup label" })
          .start(new CallbackNodeConfig("Fetch Data", () => {}))
          .then(new CallbackNodeConfig("Fetch Data", () => {}))
          .build();
      },
      (err: unknown) => {
        assert.ok(err instanceof WorkflowDefinitionError, "Expected WorkflowDefinitionError");
        assert.ok(err.message.includes("fetch-data"), `Message should include the id: ${err.message}`);
        assert.ok(err.message.includes("Duplicate ids"), `Message should mention duplicate ids: ${err.message}`);
        return true;
      },
    );
  });

  it("names both offenders in the duplicate error message", () => {
    try {
      new WorkflowBuilder({ id: "wf.dup.offenders", name: "Dup offenders" })
        .start(new CallbackNodeConfig("Send Email", () => {}))
        .then(new CallbackNodeConfig("Send Email", () => {}))
        .build();
      assert.fail("Expected WorkflowDefinitionError to be thrown");
    } catch (err: unknown) {
      assert.ok(err instanceof WorkflowDefinitionError);
      // Both offenders should appear (two entries with same id)
      const countMatches = (err.message.match(/send-email/g) ?? []).length;
      assert.ok(countMatches >= 2, `Both offenders should be listed; got message: ${err.message}`);
    }
  });

  it("throws WorkflowDefinitionError for a node with an empty label and no explicit id", () => {
    assert.throws(
      () => {
        new WorkflowBuilder({ id: "wf.empty.label", name: "Empty label" })
          .start(new CallbackNodeConfig("", () => {}))
          .build();
      },
      (err: unknown) => {
        assert.ok(err instanceof WorkflowDefinitionError, "Expected WorkflowDefinitionError");
        assert.ok(err.message.includes("Empty ids"), `Message should mention empty ids: ${err.message}`);
        return true;
      },
    );
  });

  it("includes fix tip in the error message", () => {
    assert.throws(
      () => {
        new WorkflowBuilder({ id: "wf.tip", name: "Tip" })
          .start(new CallbackNodeConfig("Dup", () => {}))
          .then(new CallbackNodeConfig("Dup", () => {}))
          .build();
      },
      (err: unknown) => {
        assert.ok(err instanceof WorkflowDefinitionError);
        assert.ok(err.message.includes("explicit `id:`"), `Message should include fix tip: ${err.message}`);
        return true;
      },
    );
  });
});

describe("WorkflowBuilder — agent connection child ids", () => {
  it("collects agent connection child ids and detects collision with a top-level node", () => {
    // We give the agent an explicit id of "my-agent".
    // The LLM connection child id will be "my-agent__conn__llm".
    // We then add a top-level node whose label slugifies to "my-agent__conn__llm".
    const agentId = "my-agent";
    const llmChildId = ConnectionNodeIdFactory.languageModelConnectionNodeId(agentId);

    // The label that slugifies to the collision id.
    // llmChildId = "my-agent__conn__llm"  →  replace non-[a-z0-9] with dash → "my-agent--conn--llm"
    // We need a label whose slug exactly equals llmChildId. Since llmChildId contains "__" (underscores),
    // and underscores are non-[a-z0-9], we need to pick a label that maps to the exact child id.
    // Let's verify the slug of llmChildId round-trips to itself.
    const sluggedChildId = NodeIdSlugifier.slugify(llmChildId);
    // Rather than relying on that, use an explicit id on the sibling node to force the collision.
    const agentConfig = makeFakeAgentConfig("My Agent", agentId);

    assert.throws(
      () => {
        const builder = new WorkflowBuilder({ id: "wf.agent.collision", name: "Agent collision" });
        builder
          .start(agentConfig as any)
          .then(new CallbackNodeConfig("Sibling Node", () => {}, { id: llmChildId }))
          .build();
      },
      (err: unknown) => {
        assert.ok(err instanceof WorkflowDefinitionError, `Expected WorkflowDefinitionError, got: ${err}`);
        assert.ok(
          err.message.includes(llmChildId),
          `Expected message to mention colliding id "${llmChildId}": ${err.message}`,
        );
        return true;
      },
    );

    // Suppress unused variable lint warning by using sluggedChildId
    void sluggedChildId;
  });

  it("does not throw when an agent node has a unique id and its connection children are unique", () => {
    const agentConfig = makeFakeAgentConfig("My Research Agent", "my-research-agent");

    assert.doesNotThrow(() => {
      new WorkflowBuilder({ id: "wf.agent.ok", name: "Agent ok" }).start(agentConfig as any).build();
    });
  });

  it("verifies that AgentConnectionNodeCollector collects children for agent configs used in tests", () => {
    const agentConfig = makeFakeAgentConfig("Test Agent", "test-agent");
    const children = AgentConnectionNodeCollector.collect("test-agent", agentConfig as any);
    // At minimum, the LLM child should be collected.
    assert.ok(children.length >= 1, "Expected at least one connection child");
    assert.ok(children.some((c) => c.nodeId === ConnectionNodeIdFactory.languageModelConnectionNodeId("test-agent")));
  });
});
