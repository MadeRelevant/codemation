import { injectable } from "@codemation/core";
import type { GmailMessageRecord } from "./GmailApiClient";

@injectable()
export class GmailQueryMatcher {
  /**
   * `listMessageIds()` already applies Gmail's native search syntax.
   * The engine only revalidates resolved labels on the fetched message.
   */
  matchesOnNewTrigger(message: GmailMessageRecord, resolvedLabelIds: ReadonlyArray<string> | undefined): boolean {
    if (resolvedLabelIds && resolvedLabelIds.length > 0) {
      const hasEveryLabel = resolvedLabelIds.every((labelId) => message.labelIds.includes(labelId));
      if (!hasEveryLabel) {
        return false;
      }
    }
    return true;
  }
}
