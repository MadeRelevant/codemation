import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  server: {
    deps: {
      inline: ["@monaco-editor/react"],
    },
  },
  test: {
    name: "@codemation/next-host",
    root: import.meta.dirname,
    environment: "node",
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
    pool: "threads",
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      // Force all source files into the denominator so per-package % matches merged lcov.
      all: true,
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        // Next.js server bootstrap — requires full App Container + Prisma + plugin discovery;
        // cannot be unit-tested without the entire host DI runtime.
        "src/server/CodemationNextHost.ts",
        "src/server/NextHostPackageRootResolver.ts",
        // Edge runtime session verifier — requires Next.js edge crypto APIs not available in jsdom/node.
        "src/auth/EdgeSessionVerifier.ts",
        // Realtime WebSocket adapter — depends on live host server; covered by e2e only.
        "src/features/workflows/lib/realtime/realtimeApi.ts",
        // Pure TypeScript type declarations — no executable lines.
        "src/lucide-react-icons.d.ts",
        // Re-export shim — no executable lines.
        "src/api/CodemationApiHttpError.ts",
        // Type-only snapshot interface — no executable lines.
        "src/whitelabel/CodemationWhitelabelSnapshot.ts",
        // Type declarations only — no runtime code.
        "src/features/credentials/lib/credentialFormTypes.ts",
        "src/features/workflows/server/WorkflowDetailPageApiPort.types.ts",
        // Wires full canvas WorkflowDetailScreen — integration/e2e territory.
        "src/features/workflows/screens/WorkflowDetailScreenPage.tsx",
        // Hook-only thin wrappers around Next.js router — integration/e2e territory.
        "src/features/workflows/canvas-adapter/NextHostNavigationAdapter.tsx",
        // Server-only composition root — no browser runtime.
        "src/features/workflows/server/WorkflowServerComposition.ts",
        // Dev inbox server composition — requires full DI container + Prisma at runtime.
        "src/server/devInboxComposition.ts",
        // Type declarations only.
        "src/providers/CodemationSession.types.ts",
        // Shell components that call usePathname / useWorkflowsQuery transitively —
        // these require a full Next.js App Router context unavailable in jsdom.
        // The logic they contain (sidebar collapse, page title) is tested via unit
        // helpers (appLayoutPageTitle, WorkflowSidebarNav*) and integration/e2e.
        "src/shell/AppLayout.tsx",
        "src/shell/AppLayoutNavItems.tsx",
        "src/shell/AppLayoutPageHeader.tsx",
        "src/shell/AppMainContent.tsx",
        "src/shell/CodemationNextClientShell.tsx",
        // Workflow screens that use canvas hooks (useWorkflowsQueryWithInitialData,
        // usePathname) — require QueryClient provider and Next.js router.
        "src/features/workflows/screens/WorkflowsScreen.tsx",
        // Credentials screen hook that orchestrates credential CRUD and deletes —
        // depends on useCredentialDialogSession which is thoroughly covered independently;
        // the screen hook integrates those pieces, tested via integration/e2e.
        "src/features/credentials/hooks/useCredentialsScreen.ts",
        // Credentials screen component — requires useCredentialsScreen and full dialog stack.
        "src/features/credentials/screens/CredentialsScreen.tsx",
        // Users screen — requires useUserAccountsQuery, useInviteUserMutation, etc.
        "src/features/users/screens/UsersScreen.tsx",
        // Collections screens/hooks — require useCollectionsQuery and router.
        "src/features/collections/screens/CollectionsScreen.tsx",
        "src/features/collections/screens/CollectionDetailScreen.tsx",
        "src/features/collections/hooks/useCollectionDetailQuery.ts",
        "src/features/collections/hooks/useCollectionsQuery.ts",
        "src/features/collections/hooks/useCollectionRowsQuery.ts",
        // Collections mutation hooks — depend on react-query and are integration-tested
        // via the CollectionRowForm tests which exercise the full form path.
        "src/features/collections/hooks/collectionMutations.tsx",
        // Collections API — thin wrappers around codemationApiClient; covered by api client tests.
        "src/features/collections/api/collectionsApi.ts",
        // Forms barrel — pure re-exports; no executable lines.
        "src/components/forms/index.ts",
        // Dashboard screen — wires many telemetry hooks; covered by DashboardScreen.test.tsx
        // (already tested). Remaining branches are Radix Select interactions (jsdom limitation).
        // "src/features/dashboard/screens/DashboardScreen.tsx" kept in; partially covered.
      ],
    },
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
    alias: [
      { find: "@codemation/canvas", replacement: path.resolve(dirname, "../canvas/src/index.ts") },
      { find: /^@codemation\/next-host\/src\/(.*)$/, replacement: path.resolve(dirname, "./src/$1") },
      { find: "@", replacement: path.resolve(dirname, "./src") },
      {
        find: "@codemation/host/dto",
        replacement: path.resolve(dirname, "../host/src/dto.ts"),
      },
      {
        find: "@codemation/host/client",
        replacement: path.resolve(dirname, "../host/src/client.ts"),
      },
      {
        find: "@codemation/host/mapping",
        replacement: path.resolve(dirname, "../host/src/mapping.ts"),
      },
      {
        find: "@codemation/host/pairing",
        replacement: path.resolve(dirname, "../host/src/pairing.ts"),
      },
      {
        find: "@codemation/core/contracts",
        replacement: path.resolve(dirname, "../core/src/contracts.ts"),
      },
      {
        find: "@codemation/core/browser",
        replacement: path.resolve(dirname, "../core/src/browser.ts"),
      },
    ],
  },
});
