/**
 * Tests for runtime-type utility classes.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { PersistedRuntimeTypeNameResolver } from "../../src/runtime-types/PersistedRuntimeTypeNameResolver";

describe("PersistedRuntimeTypeNameResolver", () => {
  test("resolves override name when provided", () => {
    class MyClass {}
    const name = PersistedRuntimeTypeNameResolver.resolve(MyClass, "OverrideName");
    assert.equal(name, "OverrideName");
  });

  test("falls back to class name when no override", () => {
    class MyNamedClass {}
    const name = PersistedRuntimeTypeNameResolver.resolve(MyNamedClass, undefined);
    assert.equal(name, "MyNamedClass");
  });

  test("throws when class is anonymous and no override provided", () => {
    // Anonymous class has no name
    const Anon = (() => class {})();
    assert.throws(
      () => PersistedRuntimeTypeNameResolver.resolve(Anon as never, undefined),
      /named class or an explicit decorator name override/,
    );
  });
});
