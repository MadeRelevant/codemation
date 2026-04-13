export class GoogleGmailApiClientScopeCatalog {
  static readonly gmailReadonly = "https://www.googleapis.com/auth/gmail.readonly";
  static readonly gmailModify = "https://www.googleapis.com/auth/gmail.modify";
  static readonly gmailSend = "https://www.googleapis.com/auth/gmail.send";
  static readonly userInfoEmail = "https://www.googleapis.com/auth/userinfo.email";

  static readonly defaultPresetKey = "automation";
  static readonly customPresetKey = "custom";

  static readonly presetScopes: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
    automation: Object.freeze([
      GoogleGmailApiClientScopeCatalog.gmailModify,
      GoogleGmailApiClientScopeCatalog.gmailSend,
      GoogleGmailApiClientScopeCatalog.userInfoEmail,
    ]),
    readonly: Object.freeze([
      GoogleGmailApiClientScopeCatalog.gmailReadonly,
      GoogleGmailApiClientScopeCatalog.userInfoEmail,
    ]),
  });
}
