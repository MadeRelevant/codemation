import { describe, expect, it } from "vitest";

import { layoutWorkflow } from "../../src/features/workflows/components/canvas/lib/layoutWorkflow";
import type { WorkflowDto } from "../../src/features/workflows/lib/realtime/workflowTypes";

/**
 * Rectangles overlap (not just touching) when their open interiors intersect
 * on both axes.
 */
function rectanglesOverlap(
  a: Readonly<{ x: number; y: number; width: number; height: number }>,
  b: Readonly<{ x: number; y: number; width: number; height: number }>,
): boolean {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  return a.x < bRight && b.x < aRight && a.y < bBottom && b.y < aBottom;
}

describe("layoutWorkflow compound agent layout", () => {
  const noop = () => {};

  async function runLayout(workflow: WorkflowDto) {
    return layoutWorkflow(
      workflow,
      {},
      [],
      {},
      new Map(),
      null,
      null,
      new Set(),
      false,
      false,
      new Set(),
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
    );
  }

  it("keeps attachment children inside the parent's compound bounding box and doesn't overlap neighbours", async () => {
    const workflow: WorkflowDto = {
      id: "wf.test.compound-agent",
      name: "Compound agent",
      active: true,
      nodes: [
        { id: "trigger", kind: "trigger", type: "ManualTrigger" },
        { id: "agent", kind: "node", type: "AIAgent", role: "agent", name: "Orchestrator" },
        { id: "agent.llm", kind: "node", type: "OpenAI", role: "languageModel", parentNodeId: "agent", name: "OpenAI" },
        { id: "agent.tool", kind: "node", type: "Callback", role: "tool", parentNodeId: "agent", name: "helper" },
        {
          id: "agent.sub",
          kind: "node",
          type: "AIAgent",
          role: "nestedAgent",
          parentNodeId: "agent",
          name: "Specialist",
        },
        {
          id: "agent.sub.llm",
          kind: "node",
          type: "OpenAI",
          role: "languageModel",
          parentNodeId: "agent.sub",
          name: "OpenAI",
        },
        { id: "sink", kind: "node", type: "NoOp", name: "Sink" },
      ],
      edges: [
        { from: { nodeId: "trigger", output: "main" }, to: { nodeId: "agent", input: "in" } },
        { from: { nodeId: "agent", output: "main" }, to: { nodeId: "agent.llm", input: "in" } },
        { from: { nodeId: "agent", output: "main" }, to: { nodeId: "agent.tool", input: "in" } },
        { from: { nodeId: "agent", output: "main" }, to: { nodeId: "agent.sub", input: "in" } },
        { from: { nodeId: "agent.sub", output: "main" }, to: { nodeId: "agent.sub.llm", input: "in" } },
        { from: { nodeId: "agent", output: "main" }, to: { nodeId: "sink", input: "in" } },
      ],
    };

    const { nodes } = await runLayout(workflow);
    const byId = new Map(nodes.map((n) => [n.id, n]));

    const agent = byId.get("agent");
    const agentLlm = byId.get("agent.llm");
    const agentTool = byId.get("agent.tool");
    const agentSub = byId.get("agent.sub");
    const agentSubLlm = byId.get("agent.sub.llm");
    const trigger = byId.get("trigger");
    const sink = byId.get("sink");
    expect(agent).toBeDefined();
    expect(agentLlm).toBeDefined();
    expect(agentTool).toBeDefined();
    expect(agentSub).toBeDefined();
    expect(agentSubLlm).toBeDefined();
    expect(trigger).toBeDefined();
    expect(sink).toBeDefined();

    const agentCardBottom = agent!.position.y + (agent!.height ?? 0);
    for (const child of [agentLlm!, agentTool!, agentSub!]) {
      const childTop = child.position.y;
      expect(childTop).toBeGreaterThanOrEqual(agentCardBottom);
    }

    const subAgentBottom = agentSub!.position.y + (agentSub!.height ?? 0);
    expect(agentSubLlm!.position.y).toBeGreaterThanOrEqual(subAgentBottom);

    const rects = nodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: n.width ?? 0,
      height: n.height ?? 0,
    }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        expect(rectanglesOverlap(a, b), `overlap between ${a.id} and ${b.id}`).toBe(false);
      }
    }

    expect(trigger!.position.x).toBeLessThan(agent!.position.x);
    expect(agent!.position.x).toBeLessThan(sink!.position.x);
  });
});
