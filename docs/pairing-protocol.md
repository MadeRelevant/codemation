# Pairing Protocol — HMAC-SHA256 Request Signing

**Version 1.** Both the framework installation and the control plane implement this protocol
independently, referencing this document as the single source of truth. The two implementations
must not drift from this spec.

---

## Overview

Every server-to-server request between a workspace's installation (host-mcp + framework HTTP API)
and the control plane is authenticated using HMAC-SHA256 over a per-workspace shared secret.
Either side can initiate a signed request; verification is symmetric.

---

## Authorization header format

```
Authorization: Codemation-Hmac v=1,workspaceId=<id>,ts=<unix-seconds>,nonce=<base64url-16-bytes>,sig=<base64>
```

Fields are comma-separated with no spaces around `=`. Order is not significant during parsing,
but implementations SHOULD emit them in the order shown above.

- `v` — protocol version. Currently always `1`. The verifier MUST reject any other value.
- `workspaceId` — the workspace identifier. The verifier uses this to look up the pairing secret.
- `ts` — Unix timestamp in whole seconds (not milliseconds) at signing time. The verifier rejects
  requests where `|now - ts| > 300` (5-minute window).
- `nonce` — 16 bytes of cryptographically random data, base64-encoded (standard or URL-safe, the
  verifier MUST accept both). Used for replay protection within the timestamp window.
- `sig` — base64 (standard) encoding of the HMAC-SHA256 value computed over the base string below.

---

## Base string (signature input)

Five fields joined by literal newline characters (`\n`), **no trailing newline**:

```
<HTTP_METHOD_UPPERCASE>\n<PATH_AND_QUERY_LOWERCASE>\n<UNIX_TIMESTAMP_SECONDS>\n<NONCE_BASE64>\n<SHA256_BODY_HEX>
```

Example for a `POST /internal/ping` with body `{"hello":"world"}`:

```
POST
/internal/ping
1715534521
8f3a...base64...
a948904f2f0f479b499...hex...
```

Field definitions:

| Field                      | Value                                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HTTP_METHOD_UPPERCASE`    | `c.req.method.toUpperCase()` — `GET`, `POST`, etc.                                                                                                                                                                                                                                           |
| `PATH_AND_QUERY_LOWERCASE` | Path + query string, both lowercased. E.g. `/internal/ping?foo=bar` becomes `/internal/ping?foo=bar`. **Caution:** query-string values that contain case-sensitive data (e.g., base64 IDs) are mangled by this step — avoid putting sensitive opaque data in query strings on signed routes. |
| `UNIX_TIMESTAMP_SECONDS`   | The `ts` value as a decimal integer string, e.g. `"1715534521"`.                                                                                                                                                                                                                             |
| `NONCE_BASE64`             | The `nonce` value exactly as it appears in the header.                                                                                                                                                                                                                                       |
| `SHA256_BODY_HEX`          | Lowercase hex SHA-256 of the raw request body bytes. If the request has no body (GET, HEAD, or a POST with no body), hash the empty string: `sha256("")` = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.                                                               |

---

## Signature computation

```
sig = base64(HMAC_SHA256(pairingSecret_bytes, baseString_utf8))
```

- `pairingSecret_bytes` — the raw 32-byte secret obtained by base64-decoding the stored
  `WORKSPACE_PAIRING_SECRET` env var (or the decrypted DB field).
- `baseString_utf8` — the base string above encoded as UTF-8.
- The result is encoded as standard base64 (not URL-safe) and placed in the `sig` field.

---

## Replay protection

The verifier tracks used nonces per workspace in an LRU map with a 10-minute TTL.
After signature verification passes, the verifier atomically checks if the nonce has been
used before and records it. If the nonce is already present, the request is rejected with 401.

Combined with the 5-minute timestamp window, this prevents replay attacks: any replayed request
will either have an expired timestamp or will match a nonce already in the store.

---

## Verifier failure modes

All failure modes return HTTP 401 with body `{"error":"Unauthorized"}`. The verifier MUST NOT
leak which failure mode triggered the rejection (timing-safe comparison required for signatures).

Failure modes (internal labels):

- `missing` — `Authorization` header absent or does not start with `Codemation-Hmac `.
- `version` — `v` field is not `1`.
- `expired` — timestamp skew > 300 seconds.
- `workspace` — workspace ID not found in the store.
- `signature` — computed HMAC does not match `sig` (use `crypto.timingSafeEqual`).
- `replay` — nonce already recorded for this workspace.

---

## Bootstrap (Sprint 2 — manual)

The pairing secret is 32 bytes of cryptographically random data, base64-encoded.
Generate once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# or
openssl rand -base64 32
```

**Control plane:** stored as `Workspace.pairingSecret` in the database, encrypted at rest using
AES-256-GCM with a separate `WORKSPACE_SECRET_KEY`. Never stored in plaintext.

**Installation:** injected as the `WORKSPACE_PAIRING_SECRET` environment variable alongside
`WORKSPACE_ID`. In dev, set both in `.env.local` of each installation process.

**Multi-process note:** In production, all processes that run on the same workspace VM share the
same `.env` / secrets manager entry. The env-var contract is:

- `WORKSPACE_ID` — the workspace's database ID.
- `WORKSPACE_PAIRING_SECRET` — the base64-encoded 32-byte secret (plaintext, not encrypted).
- `CONTROL_PLANE_URL` — the control plane API base URL (e.g., `https://api.codemation.io`).

When additional processes join the installation (e.g., a future canvas UI server), they read the
same env vars. Update this doc if that changes.

---

## Encryption at rest (control plane)

The `pairingSecret` column in the `Workspace` table is encrypted using AES-256-GCM:

- **Key:** `WORKSPACE_SECRET_KEY` env var — 32 random bytes, base64-encoded.
  Generate with `openssl rand -base64 32`.
  The key MUST be set in env; the server fails fast at boot if missing. Generating ephemerally
  at boot would render all stored secrets unreadable on restart (key mismatch), so that approach
  was explicitly rejected.
- **Storage format:** `<base64(iv)>.<base64(ciphertext+authTag)>` where IV is 12 bytes (GCM standard).
- **Key length:** 32 bytes = AES-256.

---

## Implementation notes

- Both sides use Node's `crypto` module (`createHmac`, `timingSafeEqual`, `createCipheriv`).
- The framework's `HmacRequestSigner` and control plane's `HmacVerifier` both derive from this doc.
- The nonce store is in-memory (per-process LRU) for Sprint 2. Redis-backed is deferred to
  multi-instance deployment.
