---
"@codemation/canvas-core": patch
---

fix(canvas-core): render MCP server connection children on agent canvas

PersistedWorkflowSnapshotMapper.toAttachmentNodes now iterates
agentConfig.mcpServers (both shorthand string[] and record forms) to
synthesize canvas attachment nodes for MCP servers that are not yet
materialized in snapshot.nodes. Mirrors the existing tool-slot
synthesis path with role "tool" and a stable ConnectionNodeIdFactory
mcpConnectionNodeId.
