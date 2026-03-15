import type { Prisma, PrismaClient } from "../../../src/infrastructure/persistence/generated/prisma/client.js";

export class PostgresRollbackTransaction {
  private static readonly rollbackMessage = "codemation.test.rollback";

  private readonly readySignal = new PromiseSignal<void>();
  private readonly completionSignal = new PromiseSignal<void>();
  private transactionClient: Prisma.TransactionClient | null = null;
  private transactionPromise: Promise<unknown> | null = null;

  constructor(private readonly prismaClient: PrismaClient) {}

  async start(): Promise<void> {
    const transactionPromise = this.prismaClient.$transaction(
      async (transactionClient) => {
        this.transactionClient = transactionClient;
        this.readySignal.resolve();
        await this.completionSignal.promise;
        throw this.createRollbackError();
      },
      {
        maxWait: 10_000,
        timeout: 60_000,
      },
    );
    this.transactionPromise = transactionPromise;
    void transactionPromise.catch((error) => {
      this.readySignal.reject(error);
      return undefined;
    });
    await this.readySignal.promise;
  }

  getClient(): Prisma.TransactionClient {
    if (!this.transactionClient) {
      throw new Error("PostgresRollbackTransaction.start() must complete before accessing the transaction client.");
    }
    return this.transactionClient;
  }

  getPrismaClient(): PrismaClient {
    return this.getClient() as unknown as PrismaClient;
  }

  async rollback(): Promise<void> {
    if (!this.transactionPromise) {
      return;
    }
    this.completionSignal.resolve();
    try {
      await this.transactionPromise;
    } catch (error) {
      if (this.isExpectedRollbackError(error)) {
        return;
      }
      throw error;
    }
  }

  private createRollbackError(): Error {
    return new Error(PostgresRollbackTransaction.rollbackMessage);
  }

  private isExpectedRollbackError(error: unknown): boolean {
    return error instanceof Error && error.message === PostgresRollbackTransaction.rollbackMessage;
  }
}

class PromiseSignal<TValue> {
  readonly promise: Promise<TValue>;

  private settled = false;
  private readonly resolvePromise: (value: TValue | PromiseLike<TValue>) => void;
  private readonly rejectPromise: (reason?: unknown) => void;

  constructor() {
    let resolvePromise!: (value: TValue | PromiseLike<TValue>) => void;
    let rejectPromise!: (reason?: unknown) => void;
    this.promise = new Promise<TValue>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    this.resolvePromise = resolvePromise;
    this.rejectPromise = rejectPromise;
  }

  resolve(value: TValue extends void ? undefined : TValue = undefined as TValue extends void ? undefined : TValue): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolvePromise(value as TValue);
  }

  reject(reason?: unknown): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.rejectPromise(reason);
  }
}
