---
"@codemation/host": minor
---

Add WebSocket JWT authentication for managed mode.

In `auth.kind: "managed"` mode the workspace WebSocket server now requires a CP-signed JWT
passed as `?token=<jwt>` in the upgrade URL. Connections with a missing, expired, wrong-audience,
or otherwise invalid token are closed immediately with code 4401 ("unauthorized"). Self-hosted
mode behavior is unchanged.

New exports: `WebsocketAuthenticator` interface (types), `ManagedWebsocketAuthenticator` class.
The `JwksCache` instance is shared between the HTTP JWT verifier and the WS authenticator so
key rotation propagates to both transports without a restart.
