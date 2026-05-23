---
"@codemation/host": minor
"@codemation/next-host": patch
---

Remove legacy OAuth connect code path. `OAuth2ConnectService` and its `getAuthRedirect` / `handleCallback` methods are deleted; the `/api/oauth2/auth` route and the duplicate `/api/credentials/oauth/callback` route are removed. The canonical flow is now exclusively `OAuthFlowExecutor` (`LocalOAuthFlowExecutor` / `ManagedOAuthFlowExecutor`) via `POST /api/credentials/oauth/start` and `GET /api/oauth2/callback`. Redirect-URI resolution is extracted to a dedicated `OAuth2RedirectUriResolver`. `ApiPaths.oauth2Auth()` and `ApiPaths.credentialOAuthCallback()` are removed; the client now requires the server-canonical redirect URI from `ApiPaths.oauth2RedirectUri()` before starting the flow.
