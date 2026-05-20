---
"@codemation/next-host": patch
---

fix(next-host): keep workflow activation toggle visible on unbound credentials

Retain the last known live-chrome state in a ref so the activation toggle stays
mounted during transient chrome=null resets (e.g. WorkflowDetailScreen remount after
activation failure). Toggle renders as disabled-pending during the null window rather
than disappearing.
