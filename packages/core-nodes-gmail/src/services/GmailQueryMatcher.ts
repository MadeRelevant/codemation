import { injectable } from "@codemation/core";
import type { OnNewGmailTrigger } from "../nodes/OnNewGmailTrigger";
import type { GmailMessageRecord } from "./GmailApiClient";

@injectable()
export class GmailQueryMatcher {
  matchesOnNewTrigger(
    message: GmailMessageRecord,
    config: OnNewGmailTrigger,
    resolvedLabelIds: ReadonlyArray<string> | undefined,
  ): boolean {
    if (resolvedLabelIds && resolvedLabelIds.length > 0) {
      const hasEveryLabel = resolvedLabelIds.every((labelId) => message.labelIds.includes(labelId));
      if (!hasEveryLabel) {
        return false;
      }
    }
    return this.matches({
      query: config.cfg.query,
      message,
    });
  }

  matches(
    args: Readonly<{
      query: string | undefined;
      message: GmailMessageRecord;
    }>,
  ): boolean {
    if (!args.query) {
      return true;
    }
    const normalizedQuery = args.query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }
    const searchableContent = [
      args.message.headers.From,
      args.message.headers.To,
      args.message.headers.Subject,
      args.message.snippet,
      args.message.textPlain,
      args.message.textHtml,
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
    return searchableContent.includes(normalizedQuery);
  }
}
