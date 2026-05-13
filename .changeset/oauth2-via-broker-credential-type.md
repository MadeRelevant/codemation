---
"@codemation/host": minor
---

Add `OAuth2ViaBrokerCredentialTypeFactory` — framework credential type (`host.oauth2-via-broker`) that reads the current access token from the local credential store (populated by the broker push endpoint) and injects `Authorization: Bearer <token>` on requests. Satisfies Story 8: zero credential-type code per new SaaS integration.
