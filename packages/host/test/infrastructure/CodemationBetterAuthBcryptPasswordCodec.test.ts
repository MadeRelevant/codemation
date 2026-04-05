import assert from "node:assert/strict";
import { test } from "vitest";

import { CodemationBetterAuthBcryptPasswordCodec } from "../../src/infrastructure/auth/CodemationBetterAuthBcryptPasswordCodec";

test("CodemationBetterAuthBcryptPasswordCodec round-trips bcrypt verification for Better Auth", async () => {
  const codec = new CodemationBetterAuthBcryptPasswordCodec();
  const hashed = await codec.hashPlaintext("secret-password");
  assert.equal(await codec.verifyAgainstHash({ hash: hashed, password: "secret-password" }), true);
  assert.equal(await codec.verifyAgainstHash({ hash: hashed, password: "wrong" }), false);
});
