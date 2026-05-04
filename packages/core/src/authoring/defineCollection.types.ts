import { DefinedCollectionRegistry } from "./DefinedCollectionRegistry";

export type CollectionFieldType = "text" | "int" | "bigint" | "double" | "bool" | "timestamptz" | "jsonb" | "uuid";

export interface CollectionColumnBuilder {
  notNull(): CollectionColumnBuilder;
  default(value: unknown): CollectionColumnBuilder;
  readonly _type: CollectionFieldType;
  readonly _nullable: boolean;
  readonly _default?: unknown;
}

class CollectionColumnBuilderImpl implements CollectionColumnBuilder {
  _nullable: boolean;
  _default?: unknown;

  constructor(readonly _type: CollectionFieldType) {
    this._nullable = true;
  }

  notNull(): CollectionColumnBuilder {
    this._nullable = false;
    return this;
  }

  default(value: unknown): CollectionColumnBuilder {
    this._default = value;
    this._nullable = false;
    return this;
  }
}

export const c = {
  text(): CollectionColumnBuilder {
    return new CollectionColumnBuilderImpl("text");
  },
  int(): CollectionColumnBuilder {
    return new CollectionColumnBuilderImpl("int");
  },
  bigint(): CollectionColumnBuilder {
    return new CollectionColumnBuilderImpl("bigint");
  },
  double(): CollectionColumnBuilder {
    return new CollectionColumnBuilderImpl("double");
  },
  bool(): CollectionColumnBuilder {
    return new CollectionColumnBuilderImpl("bool");
  },
  timestamptz(): CollectionColumnBuilder {
    return new CollectionColumnBuilderImpl("timestamptz");
  },
  jsonb(): CollectionColumnBuilder {
    return new CollectionColumnBuilderImpl("jsonb");
  },
  uuid(): CollectionColumnBuilder {
    return new CollectionColumnBuilderImpl("uuid");
  },
} as const;

export interface CollectionFieldDefinition {
  readonly type: CollectionFieldType;
  readonly nullable: boolean;
  readonly default?: unknown;
}

export interface CollectionIndexDefinition {
  readonly on: ReadonlyArray<string>;
  readonly unique?: boolean;
}

export interface CollectionDefinition {
  readonly name: string;
  readonly fields: Readonly<Record<string, CollectionFieldDefinition>>;
  readonly indexes: ReadonlyArray<CollectionIndexDefinition>;
}

export interface DefinedCollection<TDefinition extends CollectionDefinition = CollectionDefinition> {
  readonly kind: "defined-collection";
  readonly definition: TDefinition;
  register(context: { registerCollection(d: CollectionDefinition): void }): void;
}

/**
 * Validates that a name follows the required pattern: lowercase + underscores, starts with letter.
 */
function validateCollectionName(name: string): void {
  const pattern = /^[a-z][a-z0-9_]*$/;
  if (!pattern.test(name)) {
    throw new Error(
      `Collection name "${name}" must start with a lowercase letter and contain only lowercase letters, digits, and underscores.`,
    );
  }
}

/**
 * Validates that all field names follow the required pattern.
 */
function validateFieldNames(fields: Record<string, CollectionFieldDefinition>): void {
  const pattern = /^[a-z][a-z0-9_]*$/;
  const reserved = ["id", "created_at", "updated_at"];

  for (const fieldName of Object.keys(fields)) {
    if (reserved.includes(fieldName)) {
      throw new Error(`Field name "${fieldName}" is reserved for internal use.`);
    }
    if (!pattern.test(fieldName)) {
      throw new Error(
        `Field name "${fieldName}" must start with a lowercase letter and contain only lowercase letters, digits, and underscores.`,
      );
    }
  }
}

/**
 * Validates that all indexed fields exist in the declared fields.
 */
function validateIndexes(indexes: ReadonlyArray<CollectionIndexDefinition>, fieldNames: Set<string>): void {
  for (const index of indexes) {
    for (const fieldName of index.on) {
      if (!fieldNames.has(fieldName)) {
        throw new Error(`Index references non-existent field "${fieldName}".`);
      }
    }
  }
}

export interface DefineCollectionOptions {
  readonly name: string;
  readonly fields: Record<string, CollectionColumnBuilder>;
  readonly indexes?: ReadonlyArray<CollectionIndexDefinition>;
}

export function defineCollection<TName extends string>(
  options: DefineCollectionOptions & { name: TName },
): DefinedCollection<
  CollectionDefinition & {
    name: TName;
  }
> {
  validateCollectionName(options.name);

  // Convert the column builders to field definitions
  const fields: Record<string, CollectionFieldDefinition> = {};
  for (const [fieldName, builder] of Object.entries(options.fields)) {
    const columnBuilder = builder as CollectionColumnBuilder;
    fields[fieldName] = {
      type: columnBuilder._type,
      nullable: columnBuilder._nullable,
      default: columnBuilder._default,
    };
  }

  validateFieldNames(fields);

  const fieldNames = new Set(Object.keys(fields));
  const indexes = options.indexes ?? [];
  validateIndexes(indexes, fieldNames);

  const definition: CollectionDefinition = {
    name: options.name,
    fields,
    indexes,
  };

  // Register immediately (mirror defineNode behavior)
  DefinedCollectionRegistry.register(definition);

  const result: DefinedCollection = {
    kind: "defined-collection",
    definition,
    register(context: { registerCollection(d: CollectionDefinition): void }) {
      context.registerCollection(definition);
    },
  };

  return result as DefinedCollection<
    CollectionDefinition & {
      name: TName;
    }
  >;
}
