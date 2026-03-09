import type { CredentialId, CredentialService } from "./types";

export class CredentialNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`Credential not found: ${id}`);
    this.name = "CredentialNotFoundError";
    this.id = id;
  }
}

type StoredCredential =
  | { readonly kind: "value"; readonly value: unknown }
  | {
      readonly kind: "factory";
      readonly factory: () => unknown | Promise<unknown>;
      readonly cache: boolean;
      memo?: Promise<unknown>;
    };

export class InMemoryCredentialService implements CredentialService {
  private readonly byId = new Map<string, StoredCredential>();

  set<TSecret>(id: CredentialId<TSecret>, value: TSecret): this {
    this.byId.set(String(id), { kind: "value", value });
    return this;
  }

  /**
   * Register a credential provider. Use this for env/dotenv sources (lazy) or token refresh flows.
   *
   * Caching is on by default and memoizes the first resolved promise/value.
   */
  setFactory<TSecret>(
    id: CredentialId<TSecret>,
    factory: () => TSecret | Promise<TSecret>,
    options?: Readonly<{ cache?: boolean }>,
  ): this {
    this.byId.set(String(id), { kind: "factory", factory, cache: options?.cache ?? true });
    return this;
  }

  async get<TSecret>(id: CredentialId<TSecret>): Promise<TSecret> {
    const entry = this.byId.get(String(id));
    if (!entry) throw new CredentialNotFoundError(String(id));

    if (entry.kind === "value") return entry.value as TSecret;

    if (entry.cache) {
      if (!entry.memo) {
        entry.memo = Promise.resolve()
          .then(() => entry.factory())
          .catch((e) => {
            entry.memo = undefined;
            throw e;
          });
      }
      return (await entry.memo) as TSecret;
    }

    return (await entry.factory()) as TSecret;
  }
}

export class CompositeCredentialService implements CredentialService {
  constructor(private readonly services: ReadonlyArray<CredentialService>) {}

  async get<TSecret>(id: CredentialId<TSecret>): Promise<TSecret> {
    let notFound: CredentialNotFoundError | undefined;
    for (const svc of this.services) {
      try {
        return await svc.get(id);
      } catch (e) {
        if (e instanceof CredentialNotFoundError) {
          notFound = e;
          continue;
        }
        throw e;
      }
    }
    throw notFound ?? new CredentialNotFoundError(String(id));
  }
}

export type CredentialRef<TSecret> = Readonly<{ kind: "credential"; id: CredentialId<TSecret> }>;
export const credentialRef = <TSecret,>(id: CredentialId<TSecret>): CredentialRef<TSecret> => ({ kind: "credential", id });

export function isCredentialRef<TSecret>(value: CredentialInput<TSecret>): value is CredentialRef<TSecret>;
export function isCredentialRef(value: unknown): value is CredentialRef<unknown>;
export function isCredentialRef(value: unknown): value is CredentialRef<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "credential" && typeof v.id === "string";
}

/**
 * Convenience helper for node configs that allow either a literal value (tests/dev)
 * or a credential reference (recommended).
 */
export type CredentialInput<TSecret> = TSecret | CredentialRef<TSecret>;

export async function resolveCredential<TSecret>(input: CredentialInput<TSecret>, credentials: CredentialService): Promise<TSecret> {
  if (isCredentialRef(input)) return await credentials.get(input.id);
  return input;
}

