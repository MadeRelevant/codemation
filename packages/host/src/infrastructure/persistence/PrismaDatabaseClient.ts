import type { TypeToken } from "@codemation/core";
import type { PrismaClient as PostgresqlPrismaClient } from "./generated/prisma-postgresql-client/client.js";

export type PrismaDatabaseClient = PostgresqlPrismaClient;

export const PrismaDatabaseClientToken = Symbol.for(
  "codemation.infrastructure.persistence.PrismaDatabaseClient",
) as TypeToken<PrismaDatabaseClient>;
