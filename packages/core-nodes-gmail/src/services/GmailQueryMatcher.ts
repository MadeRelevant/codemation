import { injectable } from "@codemation/core";
import type { GmailMessageRecord } from "./GmailApiClient";

@injectable()
export class GmailQueryMatcher {
  matches(args: Readonly<{
    query: string | undefined;
    message: GmailMessageRecord;
  }>): boolean {
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
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
    return searchableContent.includes(normalizedQuery);
  }
}
