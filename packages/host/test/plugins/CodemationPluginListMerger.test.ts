import { describe, expect, it } from "vitest";
import type { CodemationPlugin, CodemationPluginContext } from "../../src/presentation/config/CodemationPlugin";
import { CodemationPluginPackageMetadata, definePlugin } from "../../src/presentation/config/CodemationPlugin";
import { CodemationPluginListMerger } from "../../src/presentation/config/CodemationPluginListMerger";

class FakeDiscoveredPlugin implements CodemationPlugin {
  register(_context: CodemationPluginContext): void {
    void _context;
  }
}

describe("CodemationPluginListMerger", () => {
  const packageMetadata = new CodemationPluginPackageMetadata();

  it("dedupes configured and discovered plugins that share a discovered package name", () => {
    const merger = new CodemationPluginListMerger(packageMetadata);
    const configuredPlugin = packageMetadata.attachPackageName(definePlugin({ register() {} }), "@codemation/gmail");
    const discoveredPlugin = packageMetadata.attachPackageName(definePlugin({ register() {} }), "@codemation/gmail");
    const configured = [configuredPlugin];
    const discovered = [discoveredPlugin];
    const merged = merger.merge(configured, discovered);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(configured[0]);
  });

  it("keeps configured instance when the same package appears in discovered", () => {
    const merger = new CodemationPluginListMerger(packageMetadata);
    const configured = [packageMetadata.attachPackageName(definePlugin({ register() {} }), "@codemation/gmail")];
    const discovered = [
      packageMetadata.attachPackageName(definePlugin({ register() {} }), "@codemation/gmail"),
      packageMetadata.attachPackageName(new FakeDiscoveredPlugin(), "@codemation/fake-discovered"),
    ];
    const merged = merger.merge(configured, discovered);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(configured[0]);
    expect(merged[1]).toBeInstanceOf(FakeDiscoveredPlugin);
  });

  it("dedupes separate discovered objects that resolve to the same package", () => {
    const merger = new CodemationPluginListMerger(packageMetadata);
    const configured = [packageMetadata.attachPackageName(definePlugin({ register() {} }), "@codemation/gmail")];
    const discovered = [packageMetadata.attachPackageName(definePlugin({ register() {} }), "@codemation/gmail")];
    const merged = merger.merge(configured, discovered);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(configured[0]);
  });

  it("dedupes two discovered entries with the same package name", () => {
    const merger = new CodemationPluginListMerger(packageMetadata);
    const firstDiscovered = packageMetadata.attachPackageName(definePlugin({ register() {} }), "@codemation/gmail");
    const secondDiscovered = packageMetadata.attachPackageName(definePlugin({ register() {} }), "@codemation/gmail");
    const merged = merger.merge([], [firstDiscovered, secondDiscovered]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(firstDiscovered);
  });
});
