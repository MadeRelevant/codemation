import path from "node:path";
import { describe, expect, it } from "vitest";
import { AgentSkillsDirectoryResolver } from "../src/AgentSkillsDirectoryResolver";

// Expose the private method for testing the fallback path directly
class AgentSkillsDirectoryResolverTestable extends AgentSkillsDirectoryResolver {
  resolveWorkspaceSkillsRootPublic(): string {
    // Call the private method via bracket notation
    return (this as unknown as { resolveWorkspaceSkillsRoot: () => string }).resolveWorkspaceSkillsRoot();
  }
}

describe("AgentSkillsDirectoryResolver", () => {
  it("resolves agent-skills root from a valid framework package location", () => {
    // Use the actual import.meta.url of this test file — agent-skills IS installed in the workspace.
    const resolver = new AgentSkillsDirectoryResolver(import.meta.url);
    const result = resolver.resolveSkillsRoot();
    expect(result).toContain("agent-skills");
    expect(result).toContain("skills");
  });

  it("resolveWorkspaceSkillsRoot falls back to a path derived from the importMetaUrl", () => {
    // Call the private fallback method directly by subclassing — this exercises lines 19-21.
    const resolver = new AgentSkillsDirectoryResolverTestable(import.meta.url);
    const result = resolver.resolveWorkspaceSkillsRootPublic();
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toContain("agent-skills");
    expect(result).toContain("skills");
  });
});
