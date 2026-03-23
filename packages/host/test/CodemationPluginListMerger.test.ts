import { describe, expect, it } from "vitest";
import { GmailNodes } from "@codemation/core-nodes-gmail";
import type { CodemationPlugin, CodemationPluginContext } from "../src/presentation/config/CodemationPlugin";
import { CodemationPluginListMerger } from "../src/presentation/config/CodemationPluginListMerger";

class FakeDiscoveredPlugin implements CodemationPlugin {
  readonly pluginPackageId = "@codemation/fake-discovered";

  register(_context: CodemationPluginContext): void {
    void _context;
  }
}

describe("CodemationPluginListMerger", () => {
  it("dedupes configured and discovered plugins that share pluginPackageId", () => {
    const merger = new CodemationPluginListMerger();
    const configured = [new GmailNodes()];
    const discovered = [new GmailNodes()];
    const merged = merger.merge(configured, discovered);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(configured[0]);
  });

  it("keeps configured instance when the same package appears in discovered", () => {
    const merger = new CodemationPluginListMerger();
    const configured = [new GmailNodes()];
    const discovered = [new GmailNodes(), new FakeDiscoveredPlugin()];
    const merged = merger.merge(configured, discovered);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(configured[0]);
    expect(merged[1]).toBeInstanceOf(FakeDiscoveredPlugin);
  });

  it("dedupes by pluginPackageId when constructor args differ (same logical package, distinct instances)", () => {
    const merger = new CodemationPluginListMerger();
    const configured = [new GmailNodes({ pullIntervalMs: 111 })];
    const discovered = [new GmailNodes({ pullIntervalMs: 999 })];
    const merged = merger.merge(configured, discovered);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(configured[0]);
  });

  it("dedupes two discovered entries with the same pluginPackageId but different options", () => {
    const merger = new CodemationPluginListMerger();
    const firstDiscovered = new GmailNodes({ maxMessagesPerPull: 1 });
    const secondDiscovered = new GmailNodes({ maxMessagesPerPull: 50 });
    const merged = merger.merge([], [firstDiscovered, secondDiscovered]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(firstDiscovered);
  });
});
