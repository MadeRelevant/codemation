---
"@codemation/host": patch
---

Move UI-only packages (monaco-editor, react, @xyflow/react, dagre, lucide-react, rc-tree, etc.) from `dependencies` to `devDependencies` in @codemation/host. No runtime source in `packages/host/src` imports these packages — they were vestigial from before the UI was extracted to @codemation/next-host. Moving them ensures pnpm filtered installs (e.g. `--filter @codemation/host...`) no longer pull in ~1.5 GB of UI dependencies, which is required for the workspace-host container image to stay small.
