---
"@codemation/cli": patch
"@codemation/agent-skills": patch
---

Disable automatic packaged skill refreshes inside the Codemation framework monorepo so framework-author workflows stop dirtying the local worktree.

- keep `codemation skills sync` as the explicit refresh path after upgrading `@codemation/cli` or `@codemation/agent-skills`
- document the monorepo behavior in the packaged CLI skill and agent-skills README
