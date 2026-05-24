---
"@codemation/host": minor
"create-codemation": patch
---

Add workspace-host Docker image packaging and managed template peerDeps fix.

- Move @codemation/\* from dependencies to peerDependencies in the managed template (avoids n8n-style dual-instance singleton trap at runtime; framework packages resolve from the base image)
- Add codemationVersion: "1.0.0" field to managed template codemation.config.ts and DefineCodemationAppOptions (reserved compatibility-date slot, no enforcement yet)
- Add packages/host/src/bin/server.ts standalone entry point for workspace pod runtime
- Add packaging/workspace-host/Dockerfile for the codemation-workspace-host:1.0.0 base image
