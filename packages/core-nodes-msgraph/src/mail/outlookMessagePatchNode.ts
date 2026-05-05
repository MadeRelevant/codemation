import type {
  CredentialRequirement,
  Item,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
} from "@codemation/core";
import { node } from "@codemation/core";
import { MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID } from "../credentials/msGraphMailOAuth";
import { createGraphClient, type MsGraphSession } from "../credentials/session";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type OutlookMessagePatchOptions = Readonly<{
  /** Mailbox: `"me"` / `""` / `"self"` → /me; any other value → /users/{mailbox}. */
  mailbox: string;
  /** Graph message id. */
  messageId: string;
  /**
   * Replace-set of categories. Outlook uses replace semantics on PATCH — whatever you
   * supply fully replaces the existing category list.
   */
  categories?: ReadonlyArray<string>;
  /** Mark the message read or unread. */
  isRead?: boolean;
  /**
   * Move to a folder. `folderId` accepts a well-known name (`inbox`, `drafts`,
   * `sentitems`, `deleteditems`) or a Graph folder id. Use `OutlookFolderResolveNode`
   * to turn a display-name path into a folder id.
   *
   * Move is applied LAST (after categories/isRead PATCH) because the message id
   * changes after a move — the new id is returned in the output.
   */
  move?: Readonly<{ folderId: string }>;
}>;

export type OutlookMessagePatchOutput = Readonly<{
  /** The message id after all patches are applied. When moved, this is the NEW id. */
  messageId: string;
  /** True when the message was moved to a different folder. */
  moved: boolean;
}>;

export class OutlookMessagePatch implements RunnableNodeConfig<OutlookMessagePatchOptions, OutlookMessagePatchOutput> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = OutlookMessagePatchNode;
  readonly icon = "builtin:microsoft-outlook" as const;

  constructor(
    public readonly name: string,
    public readonly cfg: OutlookMessagePatchOptions,
    public readonly id?: string,
  ) {}

  get description(): string {
    const ops: string[] = [];
    if (this.cfg.isRead !== undefined) ops.push(this.cfg.isRead ? "mark read" : "mark unread");
    if (this.cfg.categories && this.cfg.categories.length > 0) ops.push("set categories");
    if (this.cfg.move?.folderId) ops.push(`move to \`${this.cfg.move.folderId}\``);
    const opPart = ops.length ? `: ${ops.join(", ")}` : "";
    const msgId = this.cfg.messageId?.trim();
    return msgId ? `Patch message \`${msgId}\`${opPart}.` : `Patch message (id from upstream)${opPart}.`;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Microsoft 365 account",
        acceptedTypes: [MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID],
        helpText: "Bind a Microsoft Graph OAuth credential for the mailbox you want to access.",
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

@node({ packageName: "@codemation/core-nodes-msgraph" })
export class OutlookMessagePatchNode implements RunnableNode<OutlookMessagePatch> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<OutlookMessagePatch>): Promise<unknown> {
    const { ctx } = args;
    const { cfg } = ctx.config;
    const session = await ctx.getCredential<MsGraphSession>("auth");
    const client = createGraphClient(session);

    const prefix = mailboxPathPrefix(cfg.mailbox);
    let currentId = cfg.messageId;

    // Step 1: PATCH categories and/or isRead (one call, before any move).
    const patchBody: Record<string, unknown> = {};
    if (cfg.categories !== undefined) {
      patchBody["categories"] = [...cfg.categories];
    }
    if (cfg.isRead !== undefined) {
      patchBody["isRead"] = cfg.isRead;
    }

    if (Object.keys(patchBody).length > 0) {
      await withGraphRetry(() => client.api(`${prefix}/messages/${encodeURIComponent(currentId)}`).patch(patchBody));
    }

    // Step 2: POST /move LAST — the message id changes after move.
    let moved = false;
    if (cfg.move) {
      const moveResult = (await withGraphRetry(() =>
        client
          .api(`${prefix}/messages/${encodeURIComponent(currentId)}/move`)
          .post({ destinationId: cfg.move!.folderId }),
      )) as { id?: string };
      if (moveResult?.id) {
        currentId = moveResult.id;
      }
      moved = true;
    }

    const output: OutlookMessagePatchOutput = { messageId: currentId, moved };
    return { ...(args.item as Item), json: output };
  }
}
