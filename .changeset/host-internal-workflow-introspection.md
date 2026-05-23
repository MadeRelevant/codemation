---
"@codemation/host": minor
---

Add internal workflow introspection endpoints (`GET /internal/workflows` and `GET /internal/workflows/:workflowId`) protected by HMAC pairing-secret middleware. These allow the concierge agent to enumerate workflow summaries and fetch individual workflow DAGs (nodes + edges) via the paired-fetch channel.
