import { describe, expect, it } from "vitest";
import { SCOPE_PRESETS, resolveScopes } from "../src/credentials/scopes";

describe("resolveScopes", () => {
  it("returns the preset's scopes verbatim when customScopes is empty", () => {
    const scopes = resolveScopes("read-mail", "");
    expect(scopes).toEqual(SCOPE_PRESETS["read-mail"]);
  });

  it("ignores whitespace-only customScopes", () => {
    expect(resolveScopes("send-mail", "   \n\t  ")).toEqual(SCOPE_PRESETS["send-mail"]);
  });

  it("appends comma-separated custom scopes and dedupes", () => {
    const scopes = resolveScopes("read-mail", "Mail.Send, Calendars.Read, Mail.Read");
    expect(scopes).toContain("Mail.Send");
    expect(scopes).toContain("Calendars.Read");
    // Mail.Read is already in the preset; ensure it appears only once.
    expect(scopes.filter((s) => s === "Mail.Read")).toHaveLength(1);
  });

  it("supports whitespace-separated custom scopes", () => {
    const scopes = resolveScopes("files-read", "Tasks.Read   Notes.Read\nGroup.Read.All");
    expect(scopes).toContain("Tasks.Read");
    expect(scopes).toContain("Notes.Read");
    expect(scopes).toContain("Group.Read.All");
  });

  it("falls back to read-mail when an unknown preset is supplied", () => {
    // Cast through unknown — unknown presets are guarded at the type layer but
    // resolveScopes still has a runtime fallback.
    const scopes = resolveScopes("totally-unknown" as unknown as "read-mail", "");
    expect(scopes).toEqual(SCOPE_PRESETS["read-mail"]);
  });
});
