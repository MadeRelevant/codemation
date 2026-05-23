---
"@codemation/host": minor
"@codemation/core": minor
---

Add LocalOAuthFlowExecutor for framework (OSS/standalone) mode. Reads clientId from the credential instance's publicConfig and clientSecret from its secret material; builds PKCE-protected consent URLs; exchanges auth codes and refresh tokens directly against the provider's token endpoint. Also patches OAuthFlowExecutor.refresh to accept typeId and instanceId alongside the material, since looking up the tokenUrl and app credentials requires the instance.
