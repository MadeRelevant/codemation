/**
 * Graph-standard recipient shape. Matches `toRecipients`, `ccRecipients`, `bccRecipients`
 * as returned by the Messages API.
 */
export type Recipient = Readonly<{
  emailAddress: Readonly<{ address: string; name?: string }>;
}>;

/**
 * Filter a Graph recipient list to only those whose email address is in `allowList`.
 *
 * Comparison is case-insensitive on both sides. Recipients with no `address` are
 * excluded unconditionally (they would never match a meaningful allow-list entry).
 *
 * @param recipients - Full recipient list from Graph (toRecipients / ccRecipients / etc.)
 * @param allowList  - Email addresses to keep. Pass an empty array to exclude all.
 *
 * @example
 * const filtered = filterMailRecipients(msg.toRecipients, ["alice@contoso.com", "bob@contoso.com"]);
 */
export function filterMailRecipients(
  recipients: ReadonlyArray<Recipient>,
  allowList: ReadonlyArray<string>,
): ReadonlyArray<Recipient> {
  if (allowList.length === 0) {
    return [];
  }
  const normalised = new Set(allowList.map((a) => a.toLowerCase()));
  return recipients.filter((r) => normalised.has(r.emailAddress.address.toLowerCase()));
}
