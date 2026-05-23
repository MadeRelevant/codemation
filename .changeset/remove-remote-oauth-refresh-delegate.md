---
"@codemation/host": minor
---

Remove `RemoteOAuthRefreshDelegate` and its DI registration. The only refresh path is now `OAuthFlowExecutor`. `McpConnectionPool` uses a local inline type instead of importing from `OAuth2ViaBrokerCredentialTypeFactory`.
