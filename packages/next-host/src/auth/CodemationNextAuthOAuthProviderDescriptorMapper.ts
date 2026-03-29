import type { NextAuthConfig } from "next-auth";

export type CodemationOAuthProviderDescriptor = Readonly<{
  id: string;
  name: string;
}>;

export class CodemationNextAuthOAuthProviderDescriptorMapper {
  mapFromBuiltProviders(
    providers: ReadonlyArray<NonNullable<NextAuthConfig["providers"]>[number]>,
  ): ReadonlyArray<CodemationOAuthProviderDescriptor> {
    const out: CodemationOAuthProviderDescriptor[] = [];
    for (const p of providers) {
      if (p === null || p === undefined) {
        continue;
      }
      if (typeof p !== "object") {
        continue;
      }
      const id = "id" in p && typeof (p as { id: unknown }).id === "string" ? (p as { id: string }).id : "";
      if (id === "" || id === "credentials") {
        continue;
      }
      const rawName = "name" in p ? (p as { name: unknown }).name : undefined;
      const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName : id;
      out.push({ id, name });
    }
    return out;
  }
}
