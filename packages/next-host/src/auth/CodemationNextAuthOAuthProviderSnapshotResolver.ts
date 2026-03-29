import { CodemationAuthPrismaClient } from "../server/CodemationAuthPrismaClient";
import type { CodemationOAuthProviderDescriptor } from "./CodemationNextAuthOAuthProviderDescriptorMapper";
import { CodemationNextAuthOAuthProviderDescriptorMapper } from "./CodemationNextAuthOAuthProviderDescriptorMapper";
import { CodemationNextAuthConfigResolver } from "./CodemationNextAuthConfigResolver";
import { CodemationNextAuthProviderCatalog } from "./CodemationNextAuthProviderCatalog";

export type { CodemationOAuthProviderDescriptor } from "./CodemationNextAuthOAuthProviderDescriptorMapper";

export class CodemationNextAuthOAuthProviderSnapshotResolver {
  async resolve(): Promise<ReadonlyArray<CodemationOAuthProviderDescriptor>> {
    const env = process.env;
    const authConfig = await new CodemationNextAuthConfigResolver().resolve();
    const prisma = await CodemationAuthPrismaClient.resolveShared();
    const built = await CodemationNextAuthProviderCatalog.build(authConfig, prisma, env);
    return new CodemationNextAuthOAuthProviderDescriptorMapper().mapFromBuiltProviders(built);
  }
}
