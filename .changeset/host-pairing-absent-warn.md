---
"@codemation/host": patch
---

feat(host): warn at startup when pairing env vars are absent (Sprint 14 Story 05)

When WORKSPACE_ID, WORKSPACE_PAIRING_SECRET, or CONTROL_PLANE_URL are not set
at boot, the host now logs a named warning (codemation.pairing) listing the
missing variable names instead of silently skipping pairing registration.
This makes misconfigured managed-mode deployments immediately visible in logs.
