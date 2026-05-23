---
"@codemation/host": minor
---

Add workspace pairing primitives to `packages/host/src/pairing/`: `HmacRequestSigner`, `PairedFetch` (outgoing signed requests to the control plane), `IncomingHmacVerifier` (verify signed requests from the control plane), `InternalHmacAuthMiddleware`, and `InternalPingRegistrar`. These enable HMAC-SHA256 authenticated channels between a workspace installation and the control plane per the protocol defined in `docs/pairing-protocol.md`. Also extends `CodemationHonoApiApp` to mount optional `/internal/*` routes via the new `InternalHonoApiRouteRegistrar` token.
