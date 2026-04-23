import { describe, expect, it } from "vitest";

import {
  WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX,
  WORKFLOW_CANVAS_MAIN_NODE_CARD_PX,
  WORKFLOW_CANVAS_NESTED_AGENT_NODE_CARD_WIDTH_PX,
} from "../../src/features/workflows/components/canvas/lib/workflowCanvasNodeGeometry";
import type { WorkflowDto } from "../../src/features/workflows/lib/realtime/workflowTypes";
import { LayoutWorkflowTestKit } from "./testkit/LayoutWorkflowTestKit";

/**
 * Rendering-rule invariants for the ELK → React Flow canvas pipeline.
 *
 * Every `describe` below pins one visual decision made in
 * `WorkflowElkGraphBuilder` and `WorkflowElkResultMapper`. The suite is
 * grouped into a single file because every case goes through the same
 * `LayoutWorkflowTestKit.run(...)` call and asserts on the returned
 * `{ nodes, edges }` shape — we're really just describing "how the canvas
 * renders for workflow shape X".
 */
describe("layoutWorkflow rendering rules", () => {
  // --------------------------------------------------------------------
  // 1. Parallel branches that share a merge node terminate in the same
  //    column (ELK `elk.layered.layering.strategy = LONGEST_PATH`).
  //
  //    Before LONGEST_PATH the default NETWORK_SIMPLEX layering minimized
  //    total edge length, which snapped the shorter branch's terminal
  //    node far left and produced an ugly one-long + one-short dogleg
  //    into the merge node. This test locks the fix in place.
  // --------------------------------------------------------------------
  describe("parallel branches sharing a merge node", () => {
    it("aligns the terminal node of each branch into the layer right before the merge", async () => {
      const workflow: WorkflowDto = {
        id: "wf.test.branch-merge-alignment",
        name: "Branch merge alignment",
        active: true,
        nodes: [
          { id: "trigger", kind: "trigger", type: "ManualTrigger" },
          { id: "fork", kind: "node", type: "If" },
          { id: "long_1", kind: "node", type: "NoOp" },
          { id: "long_2", kind: "node", type: "NoOp" },
          { id: "long_3_terminal", kind: "node", type: "NoOp" },
          { id: "short_1_terminal", kind: "node", type: "NoOp" },
          { id: "merge", kind: "node", type: "Merge" },
          { id: "sink", kind: "node", type: "NoOp" },
        ],
        edges: [
          { from: { nodeId: "trigger", output: "main" }, to: { nodeId: "fork", input: "in" } },
          { from: { nodeId: "fork", output: "true" }, to: { nodeId: "long_1", input: "in" } },
          { from: { nodeId: "long_1", output: "main" }, to: { nodeId: "long_2", input: "in" } },
          { from: { nodeId: "long_2", output: "main" }, to: { nodeId: "long_3_terminal", input: "in" } },
          { from: { nodeId: "long_3_terminal", output: "main" }, to: { nodeId: "merge", input: "true" } },
          { from: { nodeId: "fork", output: "false" }, to: { nodeId: "short_1_terminal", input: "in" } },
          { from: { nodeId: "short_1_terminal", output: "main" }, to: { nodeId: "merge", input: "false" } },
          { from: { nodeId: "merge", output: "main" }, to: { nodeId: "sink", input: "in" } },
        ],
      };

      const { nodes } = await LayoutWorkflowTestKit.run(workflow);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const longTerminal = byId.get("long_3_terminal");
      const shortTerminal = byId.get("short_1_terminal");
      const merge = byId.get("merge");
      expect(longTerminal, "long terminal node must exist").toBeDefined();
      expect(shortTerminal, "short terminal node must exist").toBeDefined();
      expect(merge, "merge node must exist").toBeDefined();

      // Terminals of both branches land in the same ELK layer → same X
      // (modulo sub-pixel ELK rounding we tolerate a small epsilon).
      const terminalXDelta = Math.abs(longTerminal!.position.x - shortTerminal!.position.x);
      expect(terminalXDelta).toBeLessThanOrEqual(8);

      // Merge node must sit strictly to the right of both terminals.
      expect(merge!.position.x).toBeGreaterThan(longTerminal!.position.x);
      expect(merge!.position.x).toBeGreaterThan(shortTerminal!.position.x);
    });
  });

  // --------------------------------------------------------------------
  // 2. Branches out of an if/switch fork are placed **symmetrically**
  //    around the fork's Y (ELK `elk.layered.nodePlacement.strategy =
  //    BRANDES_KOEPF` + `bk.fixedAlignment = BALANCED`).
  //
  //    Before this, NETWORK_SIMPLEX node placement pinned one branch
  //    straight and pushed the other all the way below the fork,
  //    producing visually asymmetric trees.
  // --------------------------------------------------------------------
  describe("fork placement around the fork's Y axis", () => {
    it("places an if fork's two branches one above / one below the fork with similar offsets", async () => {
      const workflow: WorkflowDto = {
        id: "wf.test.if-symmetric",
        name: "If symmetric",
        active: true,
        nodes: [
          { id: "trigger", kind: "trigger", type: "ManualTrigger" },
          { id: "fork", kind: "node", type: "If" },
          { id: "true_leaf", kind: "node", type: "NoOp" },
          { id: "false_leaf", kind: "node", type: "NoOp" },
        ],
        edges: [
          { from: { nodeId: "trigger", output: "main" }, to: { nodeId: "fork", input: "in" } },
          { from: { nodeId: "fork", output: "true" }, to: { nodeId: "true_leaf", input: "in" } },
          { from: { nodeId: "fork", output: "false" }, to: { nodeId: "false_leaf", input: "in" } },
        ],
      };

      const { nodes } = await LayoutWorkflowTestKit.run(workflow);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const fork = byId.get("fork")!;
      const trueLeaf = byId.get("true_leaf")!;
      const falseLeaf = byId.get("false_leaf")!;

      const forkY = fork.position.y;
      const trueOffset = trueLeaf.position.y - forkY;
      const falseOffset = falseLeaf.position.y - forkY;

      // One branch above, one below.
      expect(Math.sign(trueOffset) * Math.sign(falseOffset)).toBeLessThan(0);
      // Offsets roughly equal magnitude (symmetric around fork).
      expect(Math.abs(Math.abs(trueOffset) - Math.abs(falseOffset))).toBeLessThanOrEqual(16);
    });

    it("spreads a switch node's three branches evenly around the source row", async () => {
      const workflow: WorkflowDto = {
        id: "wf.test.switch-three-way",
        name: "Switch three-way",
        active: true,
        nodes: [
          { id: "trigger", kind: "trigger", type: "ManualTrigger" },
          {
            id: "router",
            kind: "node",
            type: "Switch",
            declaredOutputPorts: ["one", "two", "three"],
          },
          { id: "leaf_one", kind: "node", type: "NoOp" },
          { id: "leaf_two", kind: "node", type: "NoOp" },
          { id: "leaf_three", kind: "node", type: "NoOp" },
        ],
        edges: [
          { from: { nodeId: "trigger", output: "main" }, to: { nodeId: "router", input: "in" } },
          { from: { nodeId: "router", output: "one" }, to: { nodeId: "leaf_one", input: "in" } },
          { from: { nodeId: "router", output: "two" }, to: { nodeId: "leaf_two", input: "in" } },
          { from: { nodeId: "router", output: "three" }, to: { nodeId: "leaf_three", input: "in" } },
        ],
      };

      const { nodes } = await LayoutWorkflowTestKit.run(workflow);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const router = byId.get("router")!;
      const leafYs = ["leaf_one", "leaf_two", "leaf_three"]
        .map((id) => byId.get(id)!.position.y)
        .sort((a, b) => a - b);

      const [topY, midY, botY] = leafYs as [number, number, number];

      // Middle branch roughly on the router row.
      expect(Math.abs(midY - router.position.y)).toBeLessThanOrEqual(16);
      // Top / bottom branches on opposite sides of the router row.
      expect(topY).toBeLessThan(router.position.y);
      expect(botY).toBeGreaterThan(router.position.y);
      // And roughly mirrored.
      const topOffset = router.position.y - topY;
      const botOffset = botY - router.position.y;
      expect(Math.abs(topOffset - botOffset)).toBeLessThanOrEqual(16);
    });
  });

  // --------------------------------------------------------------------
  // 3. Agent attachments (LLM / tool / nested agent) leave the parent
  //    card via dedicated bottom handles and render as bezier curves —
  //    the fix for overlapping LLM + single-tool connection lines.
  //
  //    This also pins the `agentAttachments` flags on node.data so the
  //    `WorkflowCanvasCodemationNodeAgentBottomSourceHandles` /
  //    `…AgentLabels` components render the right chips / handles.
  // --------------------------------------------------------------------
  describe("agent attachment edges", () => {
    async function runAgentWorkflow() {
      const workflow: WorkflowDto = {
        id: "wf.test.agent-attachments",
        name: "Agent attachments",
        active: true,
        nodes: [
          { id: "trigger", kind: "trigger", type: "ManualTrigger" },
          { id: "agent", kind: "node", type: "AIAgent", role: "agent", name: "Agent" },
          { id: "agent_llm", kind: "node", type: "OpenAI", role: "languageModel", parentNodeId: "agent" },
          { id: "agent_tool", kind: "node", type: "Callback", role: "tool", parentNodeId: "agent" },
          { id: "agent_sub", kind: "node", type: "AIAgent", role: "nestedAgent", parentNodeId: "agent" },
          { id: "sink", kind: "node", type: "NoOp" },
        ],
        edges: [
          { from: { nodeId: "trigger", output: "main" }, to: { nodeId: "agent", input: "in" } },
          { from: { nodeId: "agent", output: "main" }, to: { nodeId: "agent_llm", input: "in" } },
          { from: { nodeId: "agent", output: "main" }, to: { nodeId: "agent_tool", input: "in" } },
          { from: { nodeId: "agent", output: "main" }, to: { nodeId: "agent_sub", input: "in" } },
          { from: { nodeId: "agent", output: "main" }, to: { nodeId: "sink", input: "in" } },
        ],
      };
      return LayoutWorkflowTestKit.run(workflow);
    }

    it("wires LLM attachment edges through the LLM bottom handle as bezier curves", async () => {
      const { edges } = await runAgentWorkflow();
      const llmEdge = edges.find((e) => e.target === "agent_llm");
      expect(llmEdge).toBeDefined();
      expect(llmEdge!.sourceHandle).toBe("attachment-source-llm");
      expect(llmEdge!.type).toBe("default");
    });

    it("wires tool and nested-agent attachment edges through the TOOLS bottom handle as bezier curves", async () => {
      const { edges } = await runAgentWorkflow();
      const toolEdge = edges.find((e) => e.target === "agent_tool");
      const nestedEdge = edges.find((e) => e.target === "agent_sub");
      expect(toolEdge).toBeDefined();
      expect(nestedEdge).toBeDefined();
      for (const edge of [toolEdge!, nestedEdge!]) {
        expect(edge.sourceHandle).toBe("attachment-source-tools");
        expect(edge.type).toBe("default");
      }
    });

    it("routes non-attachment main-chain edges through the node's declared output handle (not attachment handles)", async () => {
      const { edges } = await runAgentWorkflow();
      const mainEdge = edges.find((e) => e.source === "agent" && e.target === "sink");
      expect(mainEdge).toBeDefined();
      expect(mainEdge!.sourceHandle).not.toBe("attachment-source-llm");
      expect(mainEdge!.sourceHandle).not.toBe("attachment-source-tools");
      expect(mainEdge!.type).not.toBe("default");
    });

    it("sets agentAttachments flags on the parent, and leaves them false on non-agent nodes", async () => {
      const { nodes } = await runAgentWorkflow();
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const agent = byId.get("agent")!;
      expect(agent.data.agentAttachments).toEqual({ hasLanguageModel: true, hasTools: true });
      for (const id of ["trigger", "sink", "agent_llm", "agent_tool"]) {
        const n = byId.get(id)!;
        expect(n.data.agentAttachments).toEqual({ hasLanguageModel: false, hasTools: false });
      }
    });
  });

  // --------------------------------------------------------------------
  // 4. React Flow's node box for an agent compound represents the
  //    **visible card**, not the outer ELK compound rectangle. This is
  //    the fix for the "orphan OpenAI on the left" feedback — an agent
  //    card's width/height reflect the card itself so attachment handles
  //    and chips stay glued to the visible card, and the card's X is
  //    horizontally centered over its children below.
  // --------------------------------------------------------------------
  describe("agent card React Flow dimensions", () => {
    it("sizes an agent's React Flow node to the agent card width (not the compound bounding box)", async () => {
      const workflow: WorkflowDto = {
        id: "wf.test.agent-card-dims",
        name: "Agent card dims",
        active: true,
        nodes: [
          { id: "trigger", kind: "trigger", type: "ManualTrigger" },
          { id: "agent", kind: "node", type: "AIAgent", role: "agent", name: "Agent" },
          { id: "agent_llm", kind: "node", type: "OpenAI", role: "languageModel", parentNodeId: "agent" },
          { id: "agent_tool_1", kind: "node", type: "Callback", role: "tool", parentNodeId: "agent" },
          { id: "agent_tool_2", kind: "node", type: "Callback", role: "tool", parentNodeId: "agent" },
        ],
        edges: [
          { from: { nodeId: "trigger", output: "main" }, to: { nodeId: "agent", input: "in" } },
          { from: { nodeId: "agent", output: "main" }, to: { nodeId: "agent_llm", input: "in" } },
          { from: { nodeId: "agent", output: "main" }, to: { nodeId: "agent_tool_1", input: "in" } },
          { from: { nodeId: "agent", output: "main" }, to: { nodeId: "agent_tool_2", input: "in" } },
        ],
      };
      const { nodes } = await LayoutWorkflowTestKit.run(workflow);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const agent = byId.get("agent")!;
      expect(agent.width).toBe(WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX);

      // Card is horizontally centered over the union X-range of its
      // direct attachment children — so the bottom LLM/TOOLS handles
      // reach their children with near-symmetric bezier curves.
      const childIds = ["agent_llm", "agent_tool_1", "agent_tool_2"];
      const childCenters = childIds.map((id) => {
        const child = byId.get(id)!;
        return child.position.x + (child.width ?? 0) / 2;
      });
      const childrenLeft = Math.min(...childCenters);
      const childrenRight = Math.max(...childCenters);
      const childrenCenter = (childrenLeft + childrenRight) / 2;
      const agentCenter = agent.position.x + (agent.width ?? 0) / 2;
      expect(Math.abs(agentCenter - childrenCenter)).toBeLessThanOrEqual(24);
    });

    it("sizes non-agent main nodes to the standard main-card width", async () => {
      const workflow: WorkflowDto = {
        id: "wf.test.main-card-dims",
        name: "Main card dims",
        active: true,
        nodes: [
          { id: "trigger", kind: "trigger", type: "ManualTrigger" },
          { id: "op", kind: "node", type: "NoOp" },
        ],
        edges: [{ from: { nodeId: "trigger", output: "main" }, to: { nodeId: "op", input: "in" } }],
      };
      const { nodes } = await LayoutWorkflowTestKit.run(workflow);
      const op = nodes.find((n) => n.id === "op")!;
      expect(op.width).toBe(WORKFLOW_CANVAS_MAIN_NODE_CARD_PX);
    });
  });

  // --------------------------------------------------------------------
  // 5. A nested agent with one LLM + one tool lays its children
  //    **side-by-side** thanks to `NESTED_COMPOUND_CHILDREN_ASPECT_RATIO
  //    = 2.0` on the ELK `box` packing. Three+ children still wrap to a
  //    second row (escape hatch for wider compounds).
  // --------------------------------------------------------------------
  describe("nested agent child packing", () => {
    it("places a nested agent's LLM + single tool on the same row (side-by-side)", async () => {
      const workflow: WorkflowDto = {
        id: "wf.test.nested-side-by-side",
        name: "Nested side-by-side",
        active: true,
        nodes: [
          { id: "trigger", kind: "trigger", type: "ManualTrigger" },
          { id: "root", kind: "node", type: "AIAgent", role: "agent", name: "Root" },
          { id: "nested", kind: "node", type: "AIAgent", role: "nestedAgent", parentNodeId: "root" },
          { id: "nested_llm", kind: "node", type: "OpenAI", role: "languageModel", parentNodeId: "nested" },
          { id: "nested_tool", kind: "node", type: "Callback", role: "tool", parentNodeId: "nested" },
        ],
        edges: [
          { from: { nodeId: "trigger", output: "main" }, to: { nodeId: "root", input: "in" } },
          { from: { nodeId: "root", output: "main" }, to: { nodeId: "nested", input: "in" } },
          { from: { nodeId: "nested", output: "main" }, to: { nodeId: "nested_llm", input: "in" } },
          { from: { nodeId: "nested", output: "main" }, to: { nodeId: "nested_tool", input: "in" } },
        ],
      };

      const { nodes } = await LayoutWorkflowTestKit.run(workflow);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const nested = byId.get("nested")!;
      const llm = byId.get("nested_llm")!;
      const tool = byId.get("nested_tool")!;

      expect(nested.width).toBe(WORKFLOW_CANVAS_NESTED_AGENT_NODE_CARD_WIDTH_PX);
      // Same row (attachment children share a Y inside their compound).
      expect(Math.abs(llm.position.y - tool.position.y)).toBeLessThanOrEqual(8);
      // And genuinely side-by-side, not stacked.
      expect(llm.position.x).not.toBe(tool.position.x);
    });

    it("stacks children into a second row once the compound has more than two attachments (1 LLM + 2 tools)", async () => {
      const workflow: WorkflowDto = {
        id: "wf.test.nested-stacked",
        name: "Nested stacked",
        active: true,
        nodes: [
          { id: "trigger", kind: "trigger", type: "ManualTrigger" },
          { id: "root", kind: "node", type: "AIAgent", role: "agent", name: "Root" },
          { id: "nested", kind: "node", type: "AIAgent", role: "nestedAgent", parentNodeId: "root" },
          { id: "nested_llm", kind: "node", type: "OpenAI", role: "languageModel", parentNodeId: "nested" },
          { id: "nested_tool_a", kind: "node", type: "Callback", role: "tool", parentNodeId: "nested" },
          { id: "nested_tool_b", kind: "node", type: "Callback", role: "tool", parentNodeId: "nested" },
        ],
        edges: [
          { from: { nodeId: "trigger", output: "main" }, to: { nodeId: "root", input: "in" } },
          { from: { nodeId: "root", output: "main" }, to: { nodeId: "nested", input: "in" } },
          { from: { nodeId: "nested", output: "main" }, to: { nodeId: "nested_llm", input: "in" } },
          { from: { nodeId: "nested", output: "main" }, to: { nodeId: "nested_tool_a", input: "in" } },
          { from: { nodeId: "nested", output: "main" }, to: { nodeId: "nested_tool_b", input: "in" } },
        ],
      };
      const { nodes } = await LayoutWorkflowTestKit.run(workflow);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const childYs = ["nested_llm", "nested_tool_a", "nested_tool_b"].map((id) => byId.get(id)!.position.y);
      const distinctYs = new Set(childYs.map((y) => Math.round(y)));
      // With 3 children and the nested aspect ratio ~2.0, the packer
      // wraps to at least two rows — so children are NOT all on the
      // same Y row.
      expect(distinctYs.size).toBeGreaterThan(1);
    });
  });
});
