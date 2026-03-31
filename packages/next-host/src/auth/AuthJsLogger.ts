type AuthErrorLike = Error &
  Readonly<{
    type?: unknown;
    cause?: Readonly<{
      err?: Readonly<{
        message?: unknown;
        stack?: unknown;
      }>;
    }>;
  }>;

type AuthJsLoggerInstance = Readonly<{
  error: (error: Error) => void;
}>;

export class AuthJsLogger {
  readonly logger: AuthJsLoggerInstance = {
    error: (error: Error) => {
      if (this.shouldSuppress(error)) {
        return;
      }

      const authError = error as AuthErrorLike;
      console.error(`[auth][error] ${error.name}: ${error.message}`);
      const causeMessage = authError.cause?.err?.message;
      if (typeof causeMessage === "string" && causeMessage.trim().length > 0) {
        console.error(`[auth][cause]: Error: ${causeMessage}`);
      }
      if (typeof authError.cause?.err?.stack === "string" && authError.cause.err.stack.trim().length > 0) {
        console.error(authError.cause.err.stack);
      }
      console.error("[auth][details]: {}");
    },
  };

  private shouldSuppress(error: Error): boolean {
    const authError = error as AuthErrorLike;
    if (authError.type !== "JWTSessionError") {
      return false;
    }

    const causeMessage = authError.cause?.err?.message;
    return typeof causeMessage === "string" && causeMessage.includes("no matching decryption secret");
  }
}

export const authJsLogger = new AuthJsLogger().logger;
