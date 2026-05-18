# Host Test Kit

Reusable helpers for `@codemation/host` unit tests.

## Exports (`./index.ts`)

| Export                      | Description                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `SilentLogger`              | Logger that discards all output. Use when a Logger is required but output is irrelevant. |
| `CapturingLogger`           | Logger that records all calls. Assert on `.infos`, `.warns`, `.errors`, `.debugs`.       |
| `FakeLoggerFactory`         | LoggerFactory returning the same `CapturingLogger` for every scope.                      |
| `makeAppConfig(overrides?)` | Builds a minimal `AppConfig` with SQLite defaults. Pass partial overrides to customise.  |

## MCP Test Kit (`./mcp/testkit/McpTestKit.ts`)

| Export              | Description                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `FakeMcpClient`     | Implements `tools()` and `close()` only — what the pool actually calls.                       |
| `FakeClientFactory` | `McpClientFactory` that records opened connections; optionally seeded with a specific client. |
| `FakeCredentials`   | Records session creation calls; returns a Bearer-token request modifier.                      |

## Usage

```ts
import { FakeLoggerFactory, makeAppConfig } from "../testkit";
import { FakeMcpClient, FakeClientFactory } from "./mcp/testkit/McpTestKit";
```
