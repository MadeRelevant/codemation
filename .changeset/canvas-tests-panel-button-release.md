---
"@codemation/canvas": patch
---

fix(canvas): tests panel button releases after canvas-triggered run

Replace startMutation.isPending (unstable per React Query render) with a
local isStartPending flag set before mutateAsync and cleared in .finally().
This fixes the button being stuck in "Running..." after a canvas play-dropdown
triggered test run completes.
