import { compare, hash } from "bcryptjs";

/**
 * Password hash + verify for Better Auth {@code emailAndPassword.password}, matching Codemation's bcrypt cost factor.
 */
export class CodemationBetterAuthBcryptPasswordCodec {
  private static readonly bcryptRounds = 12;

  async hashPlaintext(plaintextPassword: string): Promise<string> {
    return await hash(plaintextPassword, CodemationBetterAuthBcryptPasswordCodec.bcryptRounds);
  }

  async verifyAgainstHash(args: Readonly<{ hash: string; password: string }>): Promise<boolean> {
    return await compare(args.password, args.hash);
  }
}
