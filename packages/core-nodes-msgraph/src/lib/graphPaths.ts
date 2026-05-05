/**
 * Graph API path helpers.
 *
 * Use these everywhere instead of hand-rolling path strings so that mailbox
 * and drive addressing stays consistent across nodes.
 */

/**
 * Build the Graph API path prefix for a mailbox.
 *
 * - Empty / `"me"` / `"self"` → `/me` (credential-owner shortcut; works with `Mail.Read` scope).
 * - Any other value is treated as a UPN or object-id → `/users/{mailbox}`.
 *
 * All downstream path segments append to this prefix, e.g.
 * `${mailboxPathPrefix(mailbox)}/mailFolders/inbox/messages`.
 */
export function mailboxPathPrefix(mailbox: string): string {
  const trimmed = mailbox.trim().toLowerCase();
  if (trimmed === "" || trimmed === "me" || trimmed === "self") {
    return "/me";
  }
  return `/users/${encodeURIComponent(mailbox.trim())}`;
}

/**
 * Build the canonical Graph API path prefix for a drive item.
 *
 * Always uses the `/drives/{driveId}/items/{itemId}` form (canonical addressing)
 * rather than `/me/drive/...` — the canonical form works for personal drives,
 * shared drives, and site document libraries without needing to know which kind.
 *
 * Append operation segments directly, e.g.
 * `${drivePathPrefix({ driveId, itemId })}/content` for download.
 */
export function drivePathPrefix(args: Readonly<{ driveId: string; itemId: string }>): string {
  return `/drives/${encodeURIComponent(args.driveId)}/items/${encodeURIComponent(args.itemId)}`;
}
