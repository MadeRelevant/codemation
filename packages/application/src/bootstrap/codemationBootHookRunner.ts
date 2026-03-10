import type { Container, TypeToken } from "@codemation/core";
import type { CodemationBootHook, CodemationBootstrapContext } from "./codemationBootstrapTypes";

export class CodemationBootHookRunner {
  async run(args: Readonly<{ bootHookToken: TypeToken<CodemationBootHook> | undefined; container: Container; context: CodemationBootstrapContext }>): Promise<void> {
    if (!args.bootHookToken) return;
    const resolved = args.container.resolve(args.bootHookToken);
    const bootHook = this.asBootHook(resolved, args.bootHookToken);
    await bootHook.boot(args.context);
  }

  private asBootHook(value: unknown, token: TypeToken<CodemationBootHook>): CodemationBootHook {
    if (!value || typeof value !== "object" || typeof (value as { boot?: unknown }).boot !== "function") {
      throw new Error(`Resolved boot hook token does not implement a boot(context) method: ${this.describeToken(token)}`);
    }
    return value as CodemationBootHook;
  }

  private describeToken(token: TypeToken<CodemationBootHook>): string {
    if (typeof token === "string") return token;
    if (typeof token === "symbol") return String(token);
    const candidate = token as Readonly<{ name?: unknown }>;
    return typeof candidate.name === "string" && candidate.name ? candidate.name : "<anonymous class>";
  }
}
