import type { LiveCollectionsSchema } from "./collectionSchemaTypes";

/**
 * Reads the live (actual) database schema for collections.
 * Driver-specific implementations read from information_schema (Postgres) or sqlite_master (SQLite).
 */
export interface CollectionSchemaIntrospector {
  introspect(): Promise<LiveCollectionsSchema>;
}
