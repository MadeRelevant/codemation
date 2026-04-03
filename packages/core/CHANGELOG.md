# @codemation/core

## 0.0.19

### Patch Changes

- [#26](https://github.com/MadeRelevant/codemation/pull/26) [`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual trigger reruns and current-state resume behavior.

  Current-state execution now treats empty upstream outputs like the live queue planner, so untaken branches stay dead on resume. Manual downstream runs can also synthesize trigger test items through core intent handling instead of relying on host-specific trigger logic.

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
