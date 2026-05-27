---
"@codemation/core-nodes": minor
"@codemation/core": patch
---

feat(core-nodes,core): HITL story 10 — agent runtime HITL-as-tool support

Adds full HITL-as-tool integration to the AI agent runtime:

- `SuspensionRequest` thrown by a HITL node inside the coordinator is caught, augmented with an `AgentLoopCheckpoint` (conversation snapshot, turn/tool counts, model ID), and re-thrown so the engine can suspend the run.
- On resume, `AIAgentNode.execute()` detects `ctx.resumeContext`, reads the checkpoint from `task.metadata.agentCheckpoint`, reconstructs the conversation with a `tool_result` message (approved or rejected), and continues the agent loop.
- `onRejected: "halt" | "return"` per HITL tool binding — `"halt"` returns `undefined` immediately; `"return"` injects a rejected tool_result and lets the model recover.
- Solo-call enforcement (D3): if a HITL tool appears alongside other tools in the same planned turn, all tool calls immediately return error results so the LLM self-corrects.
- Tool description auto-injection (D4): the solo-constraint sentence is appended to HITL tool descriptions so the model learns the constraint from the schema.
- `HUMAN_APPROVAL_MARKER` symbol (`Symbol.for("codemation.humanApprovalToolBehavior")`) introduced in `humanApprovalMarker.types.ts` for story 04 coordination.
- `HumanTaskHandle` gains an optional `metadata` field (core patch) so `NodeSuspensionHandler` can round-trip the checkpoint through the suspend→resume cycle.
