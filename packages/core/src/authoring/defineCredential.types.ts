import type {
  AnyCredentialType,
  CredentialFieldSchema,
  CredentialHealth,
  CredentialJsonRecord,
  CredentialSessionFactoryArgs,
  CredentialType,
  CredentialTypeDefinition,
} from "../contracts/credentialTypes";
import { z } from "zod";

type MaybePromise<TValue> = TValue | Promise<TValue>;

type CredentialFieldInput = CredentialFieldSchema["type"] | Readonly<Omit<CredentialFieldSchema, "key">>;

type CredentialFieldMap<TConfig extends CredentialJsonRecord> = Readonly<
  Record<keyof TConfig & string, CredentialFieldInput>
>;

type ZodObjectSchema<TConfig extends CredentialJsonRecord = CredentialJsonRecord> = z.ZodType<TConfig>;

type InferCredentialConfig<TSource> =
  TSource extends z.ZodType<infer TConfig, any, any>
    ? Readonly<TConfig> & CredentialJsonRecord
    : TSource extends CredentialFieldMap<infer TConfig>
      ? TConfig
      : CredentialJsonRecord;

export interface DefineCredentialOptions<
  TPublicSource extends CredentialFieldMap<any> | ZodObjectSchema<any>,
  TSecretSource extends CredentialFieldMap<any> | ZodObjectSchema<any>,
  TSession,
> {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly public: TPublicSource;
  readonly secret: TSecretSource;
  readonly supportedSourceKinds?: CredentialTypeDefinition["supportedSourceKinds"];
  readonly auth?: CredentialTypeDefinition["auth"];
  createSession(
    args: CredentialSessionFactoryArgs<InferCredentialConfig<TPublicSource>, InferCredentialConfig<TSecretSource>>,
  ): MaybePromise<TSession>;
  test(
    args: CredentialSessionFactoryArgs<InferCredentialConfig<TPublicSource>, InferCredentialConfig<TSecretSource>>,
  ): MaybePromise<CredentialHealth>;
}

export class CredentialFieldSchemaFactory {
  static create<TConfig extends CredentialJsonRecord>(
    source: CredentialFieldMap<TConfig> | ZodObjectSchema<TConfig>,
  ): ReadonlyArray<CredentialFieldSchema> {
    if (source instanceof z.ZodObject) {
      return this.createFromZodObject(source);
    }
    return this.createFromMap(source as CredentialFieldMap<TConfig>);
  }

  private static createFromMap<TConfig extends CredentialJsonRecord>(
    source: CredentialFieldMap<TConfig>,
  ): ReadonlyArray<CredentialFieldSchema> {
    return Object.entries(source).map(([key, input], index) => {
      if (typeof input === "string") {
        return {
          key,
          label: this.humanize(key),
          order: index,
          type: input as CredentialFieldSchema["type"],
        };
      }
      return {
        key,
        order: index,
        ...(input as Readonly<Omit<CredentialFieldSchema, "key">>),
      };
    });
  }

  private static createFromZodObject<_TConfig extends CredentialJsonRecord>(
    source: z.ZodObject,
  ): ReadonlyArray<CredentialFieldSchema> {
    const shape = source.shape;
    return Object.entries(shape).map(([key, schema], index) => {
      const resolved = this.unwrap(schema);
      return {
        key,
        label: this.humanize(key),
        order: index,
        required: this.isRequired(schema) ? true : undefined,
        type: this.resolveType(resolved),
      };
    });
  }

  private static isRequired(schema: z.ZodTypeAny): boolean {
    return !(schema instanceof z.ZodOptional || schema instanceof z.ZodDefault);
  }

  private static unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
    let current: z.ZodTypeAny = schema;
    while (current instanceof z.ZodOptional || current instanceof z.ZodDefault) {
      current = current.unwrap() as z.ZodTypeAny;
    }
    return current;
  }

  private static resolveType(schema: z.ZodTypeAny): CredentialFieldSchema["type"] {
    if (schema instanceof z.ZodBoolean) {
      return "boolean";
    }
    if (schema instanceof z.ZodString) {
      return "string";
    }
    return "json";
  }

  private static humanize(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[-_.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (character) => character.toUpperCase());
  }
}

export function defineCredential<
  TPublicSource extends CredentialFieldMap<any> | ZodObjectSchema<any>,
  TSecretSource extends CredentialFieldMap<any> | ZodObjectSchema<any>,
  TSession,
>(
  options: DefineCredentialOptions<TPublicSource, TSecretSource, TSession>,
): CredentialType<InferCredentialConfig<TPublicSource>, InferCredentialConfig<TSecretSource>, TSession> & {
  readonly key: string;
} {
  const definition: CredentialTypeDefinition = {
    typeId: options.key,
    displayName: options.label,
    description: options.description,
    publicFields: CredentialFieldSchemaFactory.create(options.public),
    secretFields: CredentialFieldSchemaFactory.create(options.secret),
    supportedSourceKinds: options.supportedSourceKinds ?? ["db", "env", "code"],
    auth: options.auth,
  };

  const credentialType: AnyCredentialType = {
    definition,
    async createSession(args) {
      return await options.createSession(
        args as CredentialSessionFactoryArgs<
          InferCredentialConfig<TPublicSource>,
          InferCredentialConfig<TSecretSource>
        >,
      );
    },
    async test(args) {
      return await options.test(
        args as CredentialSessionFactoryArgs<
          InferCredentialConfig<TPublicSource>,
          InferCredentialConfig<TSecretSource>
        >,
      );
    },
  };

  return {
    ...credentialType,
    key: options.key,
  } as CredentialType<InferCredentialConfig<TPublicSource>, InferCredentialConfig<TSecretSource>, TSession> & {
    readonly key: string;
  };
}
