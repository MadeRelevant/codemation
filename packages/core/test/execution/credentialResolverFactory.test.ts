import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import type { CredentialRequirement, CredentialSessionService, NodeConfigBase, TypeToken } from "../../src/index.ts";
import { CredentialResolverFactory } from "../../src/execution/CredentialResolverFactory.ts";

class StubCredentialSessionService implements CredentialSessionService {
  constructor(private readonly behavior: { kind: "ok"; session: unknown } | { kind: "throw"; error: Error }) {}

  async getSession<TSession = unknown>(): Promise<TSession> {
    if (this.behavior.kind === "throw") {
      throw this.behavior.error;
    }
    return this.behavior.session as TSession;
  }
}

const NODE_TYPE_TOKEN: TypeToken<unknown> = Symbol.for("CredentialResolverFactoryTest.Node") as TypeToken<unknown>;

function createConfigWithRequirements(reqs: ReadonlyArray<CredentialRequirement>): NodeConfigBase {
  return {
    kind: "node",
    type: NODE_TYPE_TOKEN,
    getCredentialRequirements: () => reqs,
  };
}

test("CredentialResolverFactory.create returns a resolver that delegates to CredentialSessionService.getSession", async () => {
  const factory = new CredentialResolverFactory(
    new StubCredentialSessionService({ kind: "ok", session: { token: "abc" } }),
  );
  const getCredential = factory.create("wf.x", "node.y");
  const result = await getCredential<{ token: string }>("auth");
  assert.deepEqual(result, { token: "abc" });
});

test("CredentialResolverFactory rewraps session errors with workflow + node + slot context, preserving the cause", async () => {
  const original = new Error("Token revoked");
  const factory = new CredentialResolverFactory(new StubCredentialSessionService({ kind: "throw", error: original }));
  const getCredential = factory.create("wf.x", "node.y");
  await assert.rejects(getCredential("auth"), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match((err as Error).message, /workflow wf\.x node node\.y slot "auth"/);
    assert.match((err as Error).message, /Token revoked/);
    assert.equal((err as Error & { cause?: Error }).cause, original);
    return true;
  });
});

test("CredentialResolverFactory appends the slot's accepted credential types to the failure message", async () => {
  const original = new Error("No instance bound to slot");
  const factory = new CredentialResolverFactory(new StubCredentialSessionService({ kind: "throw", error: original }));
  const getCredential = factory.create(
    "wf.x",
    "node.y",
    createConfigWithRequirements([
      { slotKey: "auth", label: "Auth", acceptedTypes: ["openai.apiKey", "azure.apiKey"] },
    ]),
  );
  await assert.rejects(getCredential("auth"), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match((err as Error).message, /Accepted types: openai\.apiKey, azure\.apiKey\./);
    return true;
  });
});

test("CredentialResolverFactory does NOT duplicate accepted-types when the inner error already lists them", async () => {
  // Inner error already provides the suffix (e.g. credential session already enriched it). The
  // resolver detects this via three known phrasings and skips the appended suffix.
  for (const phrase of [
    "Accepted types: openai.apiKey",
    "Accepted credential types: openai.apiKey",
    "binding points at an unknown type openai.apiKey",
  ]) {
    const original = new Error(phrase);
    const factory = new CredentialResolverFactory(new StubCredentialSessionService({ kind: "throw", error: original }));
    const getCredential = factory.create(
      "wf.x",
      "node.y",
      createConfigWithRequirements([{ slotKey: "auth", label: "Auth", acceptedTypes: ["openai.apiKey"] }]),
    );
    await assert.rejects(getCredential("auth"), (err: unknown) => {
      assert.ok(err instanceof Error);
      // Should appear once (in the inner error), not twice.
      const msg = (err as Error).message;
      const matches =
        msg.match(
          /Accepted types: openai\.apiKey|Accepted credential types: openai\.apiKey|binding points at an unknown type/g,
        ) ?? [];
      assert.equal(matches.length, 1, `expected one match, got ${matches.length} for phrase "${phrase}"`);
      return true;
    });
  }
});

test("CredentialResolverFactory wraps non-Error rejections with String() coercion in the failure message", async () => {
  const factory = new CredentialResolverFactory(
    new StubCredentialSessionService({ kind: "throw", error: "not-actually-an-error-instance" as unknown as Error }),
  );
  const getCredential = factory.create("wf.x", "node.y");
  await assert.rejects(getCredential("auth"), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match((err as Error).message, /not-actually-an-error-instance/);
    return true;
  });
});
