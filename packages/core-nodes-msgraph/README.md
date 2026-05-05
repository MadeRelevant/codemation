# @codemation/core-nodes-msgraph

Microsoft Graph node set for Codemation — Outlook mail, OneDrive/SharePoint Drive, and Excel workbook operations.

## Usage

Install the package and Codemation auto-discovers the plugin via `package.json#codemation.plugin`.

```ts
import { register } from "@codemation/core-nodes-msgraph";
// Or let codemation.plugin.ts wire it automatically.
```

All nodes bind to a single `MicrosoftGraphOAuth2CredentialType` credential covering `Mail.ReadWrite`, `Mail.Send`, `Files.ReadWrite.All`, and `Sites.ReadWrite.All`.

## Node families

- **Outlook mail** — trigger, message read/reply/send/patch, folder lookup.
- **Drive (OneDrive / SharePoint)** — canonical-id resolution, listing, file get/download/upload/copy, drive enumeration.
- **Excel workbook** — session-managed open/close, worksheet and range read/write, sheet creation, cell formatting.

Refer to the Codemation plugin discovery docs for configuration schemas and usage examples.
