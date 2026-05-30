---
"@codemation/examples": patch
---

fix(metadata): resolve concrete @codemation/_ dependency versions in dist/metadata.json — eliminates workspace:_ and caret range specifiers so the control-plane compatibility matcher can evaluate artifact deps against installed workspace versions
