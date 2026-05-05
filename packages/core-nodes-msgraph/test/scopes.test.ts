import { describe, expect, it } from "vitest";
import {
  MAIL_SCOPE_PRESETS,
  DRIVE_SCOPE_PRESETS,
  resolveMailScopes,
  resolveDriveScopes,
} from "../src/credentials/scopes";

describe("resolveMailScopes", () => {
  it("returns the preset's scopes verbatim when customScopes is empty", () => {
    const scopes = resolveMailScopes("read-mail", "");
    expect(scopes).toEqual(MAIL_SCOPE_PRESETS["read-mail"]);
  });

  it("ignores whitespace-only customScopes", () => {
    expect(resolveMailScopes("send-mail", "   \n\t  ")).toEqual(MAIL_SCOPE_PRESETS["send-mail"]);
  });

  it("appends comma-separated custom scopes and dedupes", () => {
    const scopes = resolveMailScopes("read-mail", "Mail.Send, Calendars.Read, Mail.Read");
    expect(scopes).toContain("Mail.Send");
    expect(scopes).toContain("Calendars.Read");
    // Mail.Read is already in the preset; ensure it appears only once.
    expect(scopes.filter((s) => s === "Mail.Read")).toHaveLength(1);
  });

  it("supports whitespace-separated custom scopes", () => {
    const scopes = resolveMailScopes("read-mail", "Tasks.Read   Notes.Read\nGroup.Read.All");
    expect(scopes).toContain("Tasks.Read");
    expect(scopes).toContain("Notes.Read");
    expect(scopes).toContain("Group.Read.All");
  });

  it("falls back to read-mail when an unknown preset is supplied", () => {
    const scopes = resolveMailScopes("totally-unknown", "");
    expect(scopes).toEqual(MAIL_SCOPE_PRESETS["read-mail"]);
  });

  it("mail-all preset includes Mail.ReadWrite and Mail.Send", () => {
    const scopes = resolveMailScopes("mail-all", "");
    expect(scopes).toContain("Mail.ReadWrite");
    expect(scopes).toContain("Mail.Send");
    // Base scopes must also be present
    expect(scopes).toContain("openid");
    expect(scopes).toContain("offline_access");
    expect(scopes).toContain("User.Read");
  });

  it("mail-all preset is a valid MailScopePreset key", () => {
    expect(MAIL_SCOPE_PRESETS["mail-all"]).toBeDefined();
    expect(Array.isArray(MAIL_SCOPE_PRESETS["mail-all"])).toBe(true);
  });
});

describe("resolveDriveScopes", () => {
  it("returns the preset's scopes verbatim when customScopes is empty", () => {
    const scopes = resolveDriveScopes("files-read", "");
    expect(scopes).toEqual(DRIVE_SCOPE_PRESETS["files-read"]);
  });

  it("ignores whitespace-only customScopes", () => {
    expect(resolveDriveScopes("files-readwrite", "   \n\t  ")).toEqual(DRIVE_SCOPE_PRESETS["files-readwrite"]);
  });

  it("supports whitespace-separated custom scopes", () => {
    const scopes = resolveDriveScopes("files-read", "Tasks.Read   Notes.Read\nGroup.Read.All");
    expect(scopes).toContain("Tasks.Read");
    expect(scopes).toContain("Notes.Read");
    expect(scopes).toContain("Group.Read.All");
  });

  it("falls back to files-readwrite when an unknown preset is supplied", () => {
    const scopes = resolveDriveScopes("totally-unknown", "");
    expect(scopes).toEqual(DRIVE_SCOPE_PRESETS["files-readwrite"]);
  });

  it("drive-all preset includes Files.ReadWrite.All and Sites.ReadWrite.All", () => {
    const scopes = resolveDriveScopes("drive-all", "");
    expect(scopes).toContain("Files.ReadWrite.All");
    expect(scopes).toContain("Sites.ReadWrite.All");
    // Base scopes must also be present
    expect(scopes).toContain("openid");
    expect(scopes).toContain("offline_access");
    expect(scopes).toContain("User.Read");
  });

  it("drive-all preset is a valid DriveScopePreset key", () => {
    expect(DRIVE_SCOPE_PRESETS["drive-all"]).toBeDefined();
    expect(Array.isArray(DRIVE_SCOPE_PRESETS["drive-all"])).toBe(true);
  });
});
