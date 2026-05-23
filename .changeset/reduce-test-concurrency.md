---
"@codemation/host": patch
---

Reduce the number of worker processes/threads spawned by the test suite so it doesn't throttle other processes on the developer's machine. Root `turbo.json` concurrency drops 12 → 4 (cross-package parallelism) and every vitest config in `tooling/vitest/*` and `packages/host/*.config.ts` drops `maxWorkers` 2 → 1 with `fileParallelism: false`. Worst-case worker count was 12 × 2 = 24 simultaneous, now 4 × 1 = 4. CI throughput will be lower but local `pnpm test` no longer pegs the box.
