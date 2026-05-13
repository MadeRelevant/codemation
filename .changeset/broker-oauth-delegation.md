---
"@codemation/host": minor
---

Add framework-side OAuth broker delegation (Story 4): HMAC-verified `POST /internal/credentials/push` and `GET /internal/credentials` endpoints on the installation's internal HTTP API; `BrokerClient` for calling the control-plane refresh endpoint via `PairedFetch`; `RemoteOAuthRefreshDelegate` with single-flight deduplication for refreshing expired access tokens through the broker.
