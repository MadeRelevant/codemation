---
"@codemation/host": patch
---

fix(host): allow CP_WEB_ORIGIN to be a comma-separated CORS allowlist

`ManagedCorsMiddleware` compared the request origin with `===` against the raw
`CP_WEB_ORIGIN` value, so when the provisioner injects more than one origin
(e.g. the Caddy origin plus the direct dev port) the joined string never
matched any real origin. Every CORS preflight 403'd, which left the control
plane's workspace canvas stuck on "Getting your canvas ready…". The middleware
now parses `CP_WEB_ORIGIN` as a comma-separated allowlist and echoes back the
request's own origin when it is a member.
