import type { CodemationPlugin } from "@codemation/host";
import type { CodemationConsumerApp } from "@codemation/host/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer, type ViteDevServer } from "vite";

export class RuntimeDevModuleRunner {
  private vite: ViteDevServer | null = null;
  private revisionRoot: string | null = null;

  async loadConsumerApp(revisionOutputRoot: string): Promise<CodemationConsumerApp> {
    await this.ensureVite(revisionOutputRoot);
    const loaded = (await this.vite!.ssrLoadModule("/index.js")) as {
      codemationConsumerApp?: CodemationConsumerApp;
      default?: CodemationConsumerApp;
    };
    const consumerApp = loaded.codemationConsumerApp ?? loaded.default;
    if (!consumerApp) {
      throw new Error(`Built consumer output did not export a Codemation consumer app: ${revisionOutputRoot}`);
    }
    return consumerApp;
  }

  async loadDiscoveredPlugins(pluginEntryPath: string): Promise<ReadonlyArray<CodemationPlugin>> {
    if (!this.vite || !this.revisionRoot) {
      throw new Error("Vite dev server is not ready for plugin loading.");
    }
    const resolved = path.resolve(pluginEntryPath);
    const relativePath = path.relative(this.revisionRoot, resolved);
    const normalized = relativePath.split(path.sep).join("/");
    const specifier = `/${normalized}`;
    const loaded = (await this.vite.ssrLoadModule(specifier)) as {
      codemationDiscoveredPlugins?: ReadonlyArray<CodemationPlugin>;
      default?: ReadonlyArray<CodemationPlugin>;
    };
    return loaded.codemationDiscoveredPlugins ?? loaded.default ?? [];
  }

  private async ensureVite(revisionOutputRoot: string): Promise<void> {
    const resolvedRoot = path.resolve(revisionOutputRoot);
    if (this.vite && this.revisionRoot === resolvedRoot) {
      return;
    }
    if (this.vite) {
      await this.vite.close();
      this.vite = null;
      this.revisionRoot = null;
    }
    this.revisionRoot = resolvedRoot;
    this.vite = await createServer({
      root: resolvedRoot,
      appType: "custom",
      server: {
        middlewareMode: true,
      },
      optimizeDeps: {
        noDiscovery: true,
      },
    });
    await this.vite.pluginContainer.buildStart?.({});
  }

  async invalidateAndReload(args: Readonly<{ changedPaths: ReadonlyArray<string> }>): Promise<void> {
    if (!this.vite || !this.revisionRoot) {
      return;
    }
    if (args.changedPaths.length === 0) {
      return;
    }
    const moduleGraph = this.vite.moduleGraph;
    for (const rawPath of args.changedPaths) {
      const resolved = path.resolve(rawPath);
      const url = pathToFileURL(resolved).href;
      const mod = await moduleGraph.getModuleByUrl(url);
      if (mod) {
        await this.vite.reloadModule(mod);
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.vite) {
      await this.vite.close();
      this.vite = null;
      this.revisionRoot = null;
    }
  }
}
