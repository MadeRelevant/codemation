---
"@codemation/canvas": patch
---

fix(canvas): surface workflow run error in detail screen as inline banner

Replace the WorkflowActivationErrorDialog modal (which was never triggered
for run errors) with an inline alert banner mounted in the top-right floating
overlay alongside the realtime badge. The banner shows when
controller.runErrorAlertLines is non-null, includes a dismiss button, and
clears on the next run attempt. This surfaces unbound-credential and other
run errors (previously swallowed in the UI) without blocking the canvas.
