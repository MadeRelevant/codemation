import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type PluginDevConfigBootstrap = Readonly<{
  configPath: string;
}>;

/**
 * Prepares a **synthetic consumer** `codemation.config.ts` next to the plugin so `codemation dev:plugin` can boot
 * the real host/runtime the same way a normal app does. The generated file imports the plugin module, merges
 * `plugin.sandbox` into the root config, and appends the plugin to `plugins`—that is why `definePlugin` carries
 * both `sandbox` and `register` on one default export.
 */
export class PluginDevConfigFactory {
  async prepare(pluginRoot: string): Promise<PluginDevConfigBootstrap> {
    const pluginEntryPath = await this.resolvePluginEntryPath(pluginRoot);
    const configPath = path.resolve(pluginRoot, ".codemation", "plugin-dev", "codemation.config.ts");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, this.createConfigSource(configPath, pluginEntryPath), "utf8");
    return {
      configPath,
    };
  }

  private async resolvePluginEntryPath(pluginRoot: string): Promise<string> {
    const candidates = [
      path.resolve(pluginRoot, "codemation.plugin.ts"),
      path.resolve(pluginRoot, "codemation.plugin.js"),
      path.resolve(pluginRoot, "src", "codemation.plugin.ts"),
      path.resolve(pluginRoot, "src", "codemation.plugin.js"),
    ];
    for (const candidate of candidates) {
      if (await this.exists(candidate)) {
        return candidate;
      }
    }
    throw new Error('Plugin config not found. Expected "codemation.plugin.ts" in the plugin root or "src/".');
  }

  private createConfigSource(configPath: string, pluginEntryPath: string): string {
    const relativeImportPath = this.toRelativeImportPath(configPath, pluginEntryPath);
    return [
      'import type { CodemationConfig } from "@codemation/host";',
      `import plugin from ${JSON.stringify(relativeImportPath)};`,
      "",
      "const sandbox = plugin.sandbox ?? {};",
      "const config: CodemationConfig = {",
      "  ...sandbox,",
      "  plugins: [...(sandbox.plugins ?? []), plugin],",
      "};",
      "",
      "export default config;",
      "",
    ].join("\n");
  }

  private toRelativeImportPath(fromPath: string, targetPath: string): string {
    const relativePath = path.relative(path.dirname(fromPath), targetPath).replace(/\\/g, "/");
    return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
