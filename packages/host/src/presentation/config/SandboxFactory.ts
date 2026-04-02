import type { CodemationAuthConfig } from "./CodemationAuthConfig";
import type { CodemationAppDefinition, CodemationConfig } from "./CodemationConfig";

/**
 * Options for {@link SandboxFactory.create}. Supplies a stable local-dev sandbox (PGlite, inline scheduler,
 * local auth with dev bypass) and merges optional {@link CodemationConfig} overrides.
 */
export type SandboxFactoryOptions = Readonly<{
  /** Shown in the shell (`app.whitelabel.productName`). */
  productName: string;
  /** Shallow merge over defaults; `app` fields are merged per-section so you can override e.g. only `whitelabel`. */
  config?: Readonly<Partial<CodemationConfig>>;
}>;

/**
 * Builds a {@link CodemationConfig} suitable for plugin `sandbox` blocks and `codemation dev:plugin` without
 * repeating the same `app` defaults in every package.
 */
export class SandboxFactory {
  static create(options: SandboxFactoryOptions): CodemationConfig {
    return new SandboxFactory().createWithOptions(options);
  }

  private createWithOptions(options: SandboxFactoryOptions): CodemationConfig {
    const baseApp = this.defaultAppDefinition(options.productName);
    const overrideApp = options.config?.app;
    return {
      ...options.config,
      app: this.mergeApp(baseApp, overrideApp),
    };
  }

  private defaultAppDefinition(productName: string): CodemationAppDefinition {
    return {
      auth: {
        kind: "local",
        allowUnauthenticatedInDevelopment: true,
      },
      database: {
        kind: "pglite",
        pgliteDataDir: ".codemation/pglite",
      },
      scheduler: {
        kind: "inline",
      },
      whitelabel: {
        productName,
      },
    };
  }

  private mergeApp(base: CodemationAppDefinition, override?: CodemationAppDefinition): CodemationAppDefinition {
    if (!override) {
      return base;
    }
    return {
      ...base,
      ...override,
      auth: this.mergeAuth(base.auth, override.auth),
      database: { ...base.database, ...override.database },
      scheduler: { ...base.scheduler, ...override.scheduler },
      whitelabel: { ...base.whitelabel, ...override.whitelabel },
    };
  }

  private mergeAuth(
    base: CodemationAppDefinition["auth"],
    override: CodemationAppDefinition["auth"],
  ): CodemationAuthConfig | undefined {
    if (!base && !override) {
      return undefined;
    }
    if (!override) {
      return base;
    }
    if (!base) {
      return override;
    }
    return {
      ...base,
      ...override,
      kind: override.kind ?? base.kind,
    };
  }
}
