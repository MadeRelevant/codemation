import { randomUUID } from "node:crypto";
import type { CollectionDefinition, CollectionFieldDefinition } from "@codemation/core";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";

type AnyRow = Record<string, unknown>;
type FullRow = AnyRow & { id: string; created_at: Date; updated_at: Date };

/**
 * SQLite implementation of CollectionStore.
 * Uses the "collections_<name>" table.
 * - JSON fields are serialized to TEXT on write, parsed on read.
 * - Dates are stored as ISO-8601 TEXT, converted to Date on read.
 * - Boolean stored as INTEGER (0/1).
 */
export class SqliteCollectionStore {
  private readonly tableName: string;
  private readonly allowedFields: Set<string>;
  private readonly fieldDefs: ReadonlyMap<string, CollectionFieldDefinition>;
  private readonly allFieldNames: ReadonlyArray<string>;

  constructor(
    private readonly definition: CollectionDefinition,
    private readonly prismaClient: PrismaDatabaseClient,
  ) {
    this.tableName = `"collections_${definition.name}"`;
    this.allowedFields = new Set(Object.keys(definition.fields));
    this.fieldDefs = new Map(Object.entries(definition.fields));
    this.allFieldNames = ["id", ...Object.keys(definition.fields), "created_at", "updated_at"];
  }

  async insert(row: AnyRow): Promise<FullRow> {
    const now = new Date().toISOString();
    const id = (row.id as string | undefined) ?? randomUUID();
    const fields = Object.keys(row).filter((k) => this.allowedFields.has(k));

    const colList = ['"id"', '"created_at"', '"updated_at"'];
    const placeholders = ["?", "?", "?"];
    const values: unknown[] = [id, now, now];

    for (const field of fields) {
      colList.push(`"${field}"`);
      placeholders.push("?");
      values.push(this.serializeValue(field, row[field]));
    }

    const sql = `INSERT INTO ${this.tableName} (${colList.join(", ")}) VALUES (${placeholders.join(", ")})`;
    await this.prismaClient.$executeRawUnsafe(sql, ...values);

    const getResult = await this.prismaClient.$queryRawUnsafe<AnyRow[]>(
      `SELECT * FROM ${this.tableName} WHERE "id" = ?`,
      id,
    );
    return this.deserializeRow(getResult[0]);
  }

  async get(id: string): Promise<FullRow | null> {
    const rows = await this.prismaClient.$queryRawUnsafe<AnyRow[]>(
      `SELECT * FROM ${this.tableName} WHERE "id" = ?`,
      id,
    );
    return rows.length > 0 ? this.deserializeRow(rows[0]) : null;
  }

  async findOne(filter: Partial<AnyRow>): Promise<FullRow | null> {
    const { where, values } = this.buildWhereClause(filter);
    const sql = `SELECT * FROM ${this.tableName}${where ? ` WHERE ${where}` : ""} LIMIT 1`;
    const rows = await this.prismaClient.$queryRawUnsafe<AnyRow[]>(sql, ...values);
    return rows.length > 0 ? this.deserializeRow(rows[0]) : null;
  }

  async list(opts?: { limit?: number; offset?: number; where?: Partial<AnyRow> }): Promise<{
    rows: ReadonlyArray<FullRow>;
    total: number;
  }> {
    const { where, values } = this.buildWhereClause(opts?.where ?? {});
    const whereClause = where ? ` WHERE ${where}` : "";
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;

    const countResult = await this.prismaClient.$queryRawUnsafe<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM ${this.tableName}${whereClause}`,
      ...values,
    );
    const total = Number(countResult[0].cnt);

    const rows = await this.prismaClient.$queryRawUnsafe<AnyRow[]>(
      `SELECT * FROM ${this.tableName}${whereClause} ORDER BY "created_at" ASC LIMIT ? OFFSET ?`,
      ...values,
      limit,
      offset,
    );

    return { rows: rows.map((r) => this.deserializeRow(r)), total };
  }

  async update(id: string, patch: Partial<AnyRow>): Promise<FullRow> {
    const now = new Date().toISOString();
    const fields = Object.keys(patch).filter((k) => this.allowedFields.has(k));

    if (fields.length === 0) {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`Collection "${this.definition.name}": row not found for id "${id}"`);
      }
      return existing;
    }

    const setClauses = ['"updated_at" = ?'];
    const values: unknown[] = [now];

    for (const field of fields) {
      setClauses.push(`"${field}" = ?`);
      values.push(this.serializeValue(field, patch[field]));
    }
    values.push(id);

    await this.prismaClient.$executeRawUnsafe(
      `UPDATE ${this.tableName} SET ${setClauses.join(", ")} WHERE "id" = ?`,
      ...values,
    );

    const updated = await this.get(id);
    if (!updated) {
      throw new Error(`Collection "${this.definition.name}": row not found for id "${id}"`);
    }
    return updated;
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    await this.prismaClient.$executeRawUnsafe(`DELETE FROM ${this.tableName} WHERE "id" = ?`, id);
    return { deleted: true };
  }

  private buildWhereClause(filter: Partial<AnyRow>): { where: string; values: unknown[] } {
    const clauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key !== "id" && !this.allowedFields.has(key)) {
        throw new Error(
          `Collection "${this.definition.name}": field "${key}" is not declared. Declared fields: ${[...this.allowedFields].join(", ")}`,
        );
      }
      clauses.push(`"${key}" = ?`);
      values.push(this.serializeValue(key, value));
    }

    return { where: clauses.join(" AND "), values };
  }

  private serializeValue(fieldName: string, value: unknown): unknown {
    const def = this.fieldDefs.get(fieldName);
    if (!def) {
      return value;
    }
    if (def.type === "jsonb") {
      return value == null ? null : JSON.stringify(value);
    }
    if (def.type === "timestamptz") {
      return value instanceof Date ? value.toISOString() : value;
    }
    if (def.type === "bool") {
      return value === true ? 1 : value === false ? 0 : value;
    }
    return value;
  }

  private deserializeRow(raw: AnyRow): FullRow {
    const result: AnyRow = {};
    result.id = raw.id;
    result.created_at = typeof raw.created_at === "string" ? new Date(raw.created_at) : raw.created_at;
    result.updated_at = typeof raw.updated_at === "string" ? new Date(raw.updated_at) : raw.updated_at;

    for (const [fieldName, def] of this.fieldDefs) {
      const val = raw[fieldName];
      if (val == null) {
        result[fieldName] = null;
      } else if (def.type === "jsonb") {
        result[fieldName] = typeof val === "string" ? JSON.parse(val) : val;
      } else if (def.type === "timestamptz") {
        result[fieldName] = typeof val === "string" ? new Date(val) : val;
      } else if (def.type === "bool") {
        result[fieldName] = val === 1 || val === true;
      } else {
        result[fieldName] = val;
      }
    }

    return result as FullRow;
  }
}
