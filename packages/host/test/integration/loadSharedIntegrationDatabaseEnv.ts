import { readIntegrationDatabaseCache } from "../http/testkit/integrationDatabaseCache";

const cached = readIntegrationDatabaseCache();
if (cached && !process.env.CODEMATION_INTEGRATION_SHARED_DATABASE_URL?.trim()) {
  process.env.CODEMATION_INTEGRATION_SHARED_DATABASE_URL = cached.databaseUrl;
}
