---
"@codemation/core-nodes-gmail": patch
"create-codemation": patch
"@codemation/host": patch
"@codemation/next-host": patch
---

Fix manual run execution so trigger-started workflows synthesize trigger preview items when no upstream trigger data exists yet.

Add a lightweight `@codemation/host/authoring` entrypoint and update plugin sandbox imports so local dev no longer pulls heavy host server persistence modules into discovered plugin packages.
