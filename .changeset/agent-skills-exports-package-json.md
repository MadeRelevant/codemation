---
"@codemation/agent-skills": patch
"create-codemation": patch
---

Fix `pnpm create codemation <name>` failing with `ENOENT … node_modules/agent-skills/skills` when dlx'd from npm.

`@codemation/agent-skills`'s `exports` field only declared `.`, so `require.resolve("@codemation/agent-skills/package.json")` was blocked by Node's exports gate. `create-codemation`'s resolver fell back to a workspace-only relative path that doesn't exist outside the monorepo. Adds `./package.json` and `./skills/*` to the exports map so subpath access works for consumers — and bumps `create-codemation` patch so the next release pins the fixed agent-skills version.
