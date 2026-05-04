/**
 * DTOs for the Collections HTTP API.
 * Pure types — no classes, no imports with side effects.
 */

export interface CollectionFieldDto {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
}

export interface CollectionIndexDto {
  readonly fields: ReadonlyArray<string>;
  readonly unique: boolean;
}

export interface CollectionSummaryDto {
  readonly name: string;
  readonly fieldCount: number;
  readonly rowCount: number;
}

export interface CollectionDetailDto {
  readonly name: string;
  readonly fields: ReadonlyArray<CollectionFieldDto>;
  readonly indexes: ReadonlyArray<CollectionIndexDto>;
}

export interface CollectionRowDto {
  readonly id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ListCollectionRowsResponseDto {
  readonly rows: ReadonlyArray<CollectionRowDto>;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface SyncCollectionsResponseDto {
  readonly planned: number;
  readonly applied: number;
  readonly dryRun: boolean;
}
