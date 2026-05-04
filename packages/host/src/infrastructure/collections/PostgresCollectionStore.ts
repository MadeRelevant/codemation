import { randomUUID } from "node:crypto";
import type { CollectionDefinition } from "@codemation/core";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";

type AnyRow = Record<string, unknown>;
type FullRow = AnyRow & { id: string; created_at: Date; updated_at: Date };

/**
 * Postgres implementation of CollectionStore.
 * Uses the "collections"."<name>" table.
 * All identifiers are whitelisted against the CollectionDefinition.
 */
export class PostgresCollectionStore {
  private readonly tableName: string;
  private readonly allowedFields: Set<string>;
  private readonly allFields: ReadonlyArray<string>;

  constructor(
    private readonly definition: CollectionDefinition,
    private readonly prismaClient: PrismaDatabaseClient,
  ) {
    this.tableName = `"collections"."${definition.name}"`;
    this.allowedFields = new Set(Object.keys(definition.fields));
    this.allFields = ["id", ...Object.keys(definition.fields), "created_at", "updated_at"];
  }

  async insert(row: AnyRow): Promise<FullRow> {
    const now = new Date();
    const id = (row.id as string | undefined) ?? randomUUID();
    const fields = Object.keys(row).filter((k) => this.allowedFields.has(k));
    const values: unknown[] = [id, now, now];
    const colList = ['"id"', '"created_at"', '"updated_at"'];

    for (const field of fields) {
      colList.push(`"${field}"`);
      values.push(row[field]);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${this.tableName} (${colList.join(", ")}) VALUES (${placeholders}) RETURNING *`;

    const result = await this.prismaClient.$queryRawUnsafe<AnyRow[]>(sql, ...values);
    return this.deserializeRow(result[0]);
  }

  async get(id: string): Promise<FullRow | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE "id" = $1`;
    const rows = await this.prismaClient.$queryRawUnsafe<AnyRow[]>(sql, id);
    return rows.length > 0 ? this.deserializeRow(rows[0]) : null;
  }

  async findOne(filter: Partial<AnyRow>): Promise<FullRow | null> {
    const { where, values } = this.buildWhereClause(filter, 1);
    const sql = `SELECT * FROM ${this.tableName}${where ? ` WHERE ${where}` : ""} LIMIT 1`;
    const rows = await this.prismaClient.$queryRawUnsafe<AnyRow[]>(sql, ...values);
    return rows.length > 0 ? this.deserializeRow(rows[0]) : null;
  }

  async list(opts?: { limit?: number; offset?: number; where?: Partial<AnyRow> }): Promise<{
    rows: ReadonlyArray<FullRow>;
    total: number;
  }> {
    const { where, values } = this.buildWhereClause(opts?.where ?? {}, 1);
    const whereClause = where ? ` WHERE ${where}` : "";

    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;

    const countSql = `SELECT COUNT(*)::integer AS cnt FROM ${this.tableName}${whereClause}`;
    const countResult = await this.prismaClient.$queryRawUnsafe<{ cnt: number }[]>(countSql, ...values);
    const total = Number(countResult[0].cnt);

    const nextParam = values.length + 1;
    const dataSql = `SELECT * FROM ${this.tableName}${whereClause} ORDER BY "created_at" ASC LIMIT $${nextParam} OFFSET $${nextParam + 1}`;
    const rows = await this.prismaClient.$queryRawUnsafe<AnyRow[]>(dataSql, ...values, limit, offset);

    return { rows: rows.map((r) => this.deserializeRow(r)), total };
  }

  async update(id: string, patch: Partial<AnyRow>): Promise<FullRow> {
    const now = new Date();
    const fields = Object.keys(patch).filter((k) => this.allowedFields.has(k));
    if (fields.length === 0) {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`Collection "${this.definition.name}": row not found for id "${id}"`);
      }
      return existing;
    }

    const setClauses: string[] = [];
    const values: unknown[] = [now];
    setClauses.push(`"updated_at" = $1`);

    for (const field of fields) {
      values.push(patch[field]);
      setClauses.push(`"${field}" = $${values.length}`);
    }
    values.push(id);

    const sql = `UPDATE ${this.tableName} SET ${setClauses.join(", ")} WHERE "id" = $${values.length} RETURNING *`;
    const result = await this.prismaClient.$queryRawUnsafe<AnyRow[]>(sql, ...values);

    if (result.length === 0) {
      throw new Error(`Collection "${this.definition.name}": row not found for id "${id}"`);
    }
    return this.deserializeRow(result[0]);
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    const sql = `DELETE FROM ${this.tableName} WHERE "id" = $1`;
    await this.prismaClient.$executeRawUnsafe(sql, id);
    return { deleted: true };
  }

  private buildWhereClause(filter: Partial<AnyRow>, startParam: number): { where: string; values: unknown[] } {
    const clauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key !== "id" && !this.allowedFields.has(key)) {
        throw new Error(
          `Collection "${this.definition.name}": field "${key}" is not declared. Declared fields: ${[...this.allowedFields].join(", ")}`,
        );
      }
      values.push(value);
      clauses.push(`"${key}" = $${startParam + values.length - 1}`);
    }

    return { where: clauses.join(" AND "), values };
  }

  private deserializeRow(raw: AnyRow): FullRow {
    const result: AnyRow = {};
    for (const field of this.allFields) {
      if (field === "created_at" || field === "updated_at") {
        const val = raw[field];
        result[field] = val instanceof Date ? val : new Date(val as string);
      } else {
        result[field] = raw[field];
      }
    }
    return result as FullRow;
  }
}
