import type { CodemationConfig } from "./codemationBootstrapTypes";

export class CodemationConfigFactory {
  define<TConfig extends CodemationConfig>(config: TConfig): TConfig {
    return config;
  }
}
