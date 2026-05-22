---
"@codemation/host": minor
"@codemation/next-host": patch
---

Add credential dialog Create-then-Connect flow for OAuth2 credential types.

New endpoints `POST /api/credentials/oauth/start` and `GET /api/credentials/oauth/callback` drive the `OAuthFlowExecutor` directly from the credential dialog. The frontend starts the consent flow via a popup opened against the consent URL returned by `/start`; the `/callback` page exchanges the code, persists the tokens, and posts a message to close the popup.

The `OAuthFlowExecutor` interface gains a `lookupInstanceId(stateToken)` method (additive; no breaking change to callers). `CredentialDialog` footer shows Connect / Reconnect for OAuth2 instances in edit mode.
