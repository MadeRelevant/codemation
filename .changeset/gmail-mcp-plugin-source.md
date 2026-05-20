---
"@codemation/host": minor
"@codemation/core-nodes-gmail": minor
---

Declare Gmail MCP server via plugin source (standalone framework). Add mcpServers to DefinePluginOptions and thread it through createPlugin. Add gmail MCP server declaration to core-nodes-gmail plugin. Break host↔gmail cycle by removing gmail from host devDependencies.
