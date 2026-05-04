/**
 * Dependency cruiser config: architectural guardrails for Phase 1 cleanup
 * Ensures next-host respects slim subpath exports and generated files stay private.
 */

module.exports = {
  forbidden: [
    {
      name: "no-next-host-barrel-in-client",
      comment:
        "next-host client code must use slim @codemation/host/* subpath exports, not the root barrel. " +
        "Root barrel imports pull in heavy infrastructure (Prisma, Hono, etc.) into client bundles. " +
        "See Phase 1.2 in CLAUDE.md.",
      severity: "error",
      from: {
        path: "packages/next-host/src",
        pathNot: "packages/next-host/src/server",
      },
      to: {
        path: "@codemation/host$",
      },
    },
    {
      name: "no-next-host-src-imports",
      comment:
        "next-host must not import internal @codemation/host-src/* modules. " +
        "Use published slim subpath exports (@codemation/host/dto, @codemation/host/client, etc.). " +
        "See Phase 1.2 in CLAUDE.md.",
      severity: "error",
      from: {
        path: "packages/next-host/src",
      },
      to: {
        path: "@codemation/host-src/.*",
      },
    },
    {
      name: "no-prisma-generated-outside-persistence",
      comment:
        "Generated Prisma clients must not be imported outside host infrastructure persistence. " +
        "They are private implementation details. Use @codemation/host/persistence interfaces if needed. " +
        "See Phase 1.3 in CLAUDE.md.",
      severity: "error",
      from: {
        pathNot: ["packages/host/src/infrastructure/persistence", "packages/host/test"],
      },
      to: {
        path: ".*/prisma-generated/.*",
      },
    },
  ],
};
