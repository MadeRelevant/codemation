import { injectable } from "@codemation/core";
import type { GmailSession } from "../../contracts/GmailSession";
import type { GmailApiClient } from "../../services/GmailApiClient";
import { GmailMessagePayloadTextExtractor } from "./GmailMessagePayloadTextExtractor";
import { GmailMimeMessageFactory } from "./GmailMimeMessageFactory";
import { GoogleGmailApiClient } from "./GoogleGmailApiClient";

@injectable()
export class GoogleGmailApiClientFactory {
  create(session: GmailSession): GmailApiClient {
    return new GoogleGmailApiClient(session, new GmailMessagePayloadTextExtractor(), new GmailMimeMessageFactory());
  }
}
