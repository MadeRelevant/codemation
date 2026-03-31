import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import noOnlyTests from "eslint-plugin-no-only-tests";

const allowedConstructorNames = new Set([
  "Date",
  "Error",
  "Map",
  "Promise",
  "RegExp",
  "Response",
  "Set",
  "URL",
  "WeakMap",
  "WeakSet",
  "WebSocketServer",
]);
const compositionRootFilePattern =
  /(?:Factory|Builder|Bootstrap|Discovery|Runner|Server|Mapper|Reader|Writer|Finder|Registry|Host|Protocol|Session|Program|Supervisor|Planner|Resolver|Environment|Worker|Scheduler|Connection|Application|Hub|Reporter|Loader|Validator|CliBin|LocalUserCreator|DevLock)\.tsx?$/;
const isCompositionRootFile = (filename) =>
  compositionRootFilePattern.test(filename) || /\/src\/bin\/[^/]+\.tsx?$/.test(filename);

/**
 * Types that are routinely constructed at call sites (messages, errors, DTOs)
 * rather than resolved from a DI container.
 */
const isManualNewAllowedTypeName = (name) =>
  typeof name === "string" &&
  (name.endsWith("Command") ||
    name.endsWith("Query") ||
    name.endsWith("Exception") ||
    name.endsWith("Error") ||
    name.endsWith("Dto"));

function isPascalCaseComponentName(name) {
  return typeof name === "string" && name.length > 0 && /^[A-Z]/.test(name);
}

function extendsReactComponentClass(superClass) {
  if (!superClass) return false;
  if (superClass.type === "Identifier") {
    return superClass.name === "Component" || superClass.name === "PureComponent";
  }
  if (superClass.type === "MemberExpression" && superClass.property.type === "Identifier" && !superClass.computed) {
    const prop = superClass.property.name;
    return prop === "Component" || prop === "PureComponent";
  }
  return false;
}

function isMemoOrForwardRefCall(node) {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type === "Identifier") {
    return callee.name === "memo" || callee.name === "forwardRef";
  }
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier" && !callee.computed) {
    const prop = callee.property.name;
    return prop === "memo" || prop === "forwardRef";
  }
  return false;
}

/** `const`-based components must use `memo` / `forwardRef` so tiny SVG/icon helpers (`const IconX = () => …`) are not counted as components. */
function isComponentVariableInit(init) {
  return Boolean(init && init.type === "CallExpression" && isMemoOrForwardRefCall(init));
}

function collectTopLevelReactComponents(program) {
  /** @type {import("estree").Node[]} */
  const components = [];

  function considerStatement(stmt) {
    if (!stmt) return;

    if (stmt.type === "ExportNamedDeclaration") {
      considerStatement(stmt.declaration);
      return;
    }

    if (stmt.type === "ExportDefaultDeclaration") {
      const d = stmt.declaration;
      if (d.type === "FunctionDeclaration" && d.id && isPascalCaseComponentName(d.id.name)) {
        components.push(d);
        return;
      }
      if (d.type === "ClassDeclaration" && d.id && extendsReactComponentClass(d.superClass)) {
        components.push(d);
        return;
      }
      if (d.type === "VariableDeclaration") {
        considerVariableDeclaration(d);
        return;
      }
      if (d.type === "ArrowFunctionExpression" || d.type === "FunctionExpression") {
        components.push(stmt);
        return;
      }
      if (d.type === "CallExpression" && isMemoOrForwardRefCall(d)) {
        components.push(stmt);
      }
      return;
    }

    if (stmt.type === "FunctionDeclaration") {
      if (stmt.id && isPascalCaseComponentName(stmt.id.name)) {
        components.push(stmt);
      }
      return;
    }

    if (stmt.type === "ClassDeclaration") {
      if (stmt.id && extendsReactComponentClass(stmt.superClass)) {
        components.push(stmt);
      }
      return;
    }

    if (stmt.type === "VariableDeclaration") {
      considerVariableDeclaration(stmt);
    }
  }

  function considerVariableDeclaration(decl) {
    for (const d of decl.declarations) {
      if (d.id.type !== "Identifier" || !isPascalCaseComponentName(d.id.name)) continue;
      if (isComponentVariableInit(d.init)) {
        components.push(d);
      }
    }
  }

  for (const stmt of program.body) {
    considerStatement(stmt);
  }

  return components;
}

const architecturePlugin = {
  rules: {
    "single-react-component-per-file": {
      meta: {
        type: "suggestion",
        docs: {
          description: "allow at most one React component per .tsx file (split helpers into separate files)",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename ?? context.getFilename();
        if (!filename.endsWith(".tsx")) return {};

        return {
          Program(node) {
            const components = collectTopLevelReactComponents(node);
            if (components.length <= 1) return;
            for (const decl of components.slice(1)) {
              context.report({
                node: decl,
                message:
                  "Each .tsx file should define a single React component at module scope. Move additional components (including private helpers) into their own files.",
              });
            }
          },
        };
      },
    },
    "single-class-per-file": {
      meta: {
        type: "suggestion",
        docs: {
          description: "enforce a single class per source file",
        },
        schema: [],
      },
      create(context) {
        const classes = [];
        return {
          ClassDeclaration(node) {
            classes.push(node);
          },
          "Program:exit"() {
            if (classes.length <= 1) return;
            for (const node of classes.slice(1)) {
              context.report({
                node,
                message:
                  "Each source file should declare a single class. Split additional classes into their own files.",
              });
            }
          },
        };
      },
    },
    "no-manual-di-new": {
      meta: {
        type: "problem",
        docs: {
          description: "discourage direct construction outside composition roots",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename ?? context.getFilename();
        if (isCompositionRootFile(filename)) return {};
        return {
          NewExpression(node) {
            if (node.callee.type !== "Identifier") return;
            if (!/^[A-Z]/.test(node.callee.name)) return;
            if (allowedConstructorNames.has(node.callee.name)) return;
            if (isManualNewAllowedTypeName(node.callee.name)) return;
            context.report({
              node,
              message:
                "Avoid direct construction here. Register the dependency with tsyringe and inject or resolve it through the composition root instead.",
            });
          },
        };
      },
    },
    "no-static-methods": {
      meta: {
        type: "problem",
        docs: {
          description: "discourage static methods outside composition roots",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename ?? context.getFilename();
        if (isCompositionRootFile(filename)) return {};
        return {
          "MethodDefinition[static=true]"(node) {
            context.report({
              node,
              message:
                "Avoid static methods here. Move the behavior behind an injected class or a composition-root-specific factory.",
            });
          },
        };
      },
    },
    /**
     * The HTML global `title` attribute triggers native browser tooltips. Prefer visible copy,
     * `aria-label` when supplementary, or a design-system tooltip—not ad-hoc `title={...}` on DOM
     * or components that forward it (Next.js `Link`, Radix/shadcn triggers, etc.).
     */
    "no-native-tooltip-title-attribute": {
      meta: {
        type: "problem",
        docs: {
          description: "forbid HTML title attribute used as native browser tooltip",
        },
        schema: [],
      },
      create(context) {
        const filename = context.filename ?? context.getFilename();
        if (!filename.endsWith(".tsx")) {
          return {};
        }

        const componentsThatForwardTitleToDom = new Set(["Link", "Button", "CollapsibleTrigger", "SelectTrigger"]);

        function isIntrinsicJsxTag(name) {
          if (name.type === "JSXIdentifier") {
            return /^[a-z]/.test(name.name);
          }
          if (name.type === "JSXMemberExpression" && name.property.type === "JSXIdentifier") {
            return /^[a-z]/.test(name.property.name);
          }
          return false;
        }

        function forbidsTitleAttribute(elementName) {
          if (elementName.type === "JSXIdentifier") {
            if (isIntrinsicJsxTag(elementName)) {
              return true;
            }
            return componentsThatForwardTitleToDom.has(elementName.name);
          }
          if (elementName.type === "JSXMemberExpression") {
            return isIntrinsicJsxTag(elementName);
          }
          return false;
        }

        return {
          JSXOpeningElement(node) {
            if (!forbidsTitleAttribute(node.name)) {
              return;
            }
            for (const attr of node.attributes) {
              if (attr.type !== "JSXAttribute") {
                continue;
              }
              if (attr.name.type !== "JSXIdentifier" || attr.name.name !== "title") {
                continue;
              }
              context.report({
                node: attr,
                message:
                  "Do not use the HTML `title` attribute (native browser tooltips). Prefer visible text, `aria-label` for supplementary context, or a shared tooltip component—not `title={...}`.",
              });
            }
          },
        };
      },
    },
  },
};

const baseLanguageOptions = {
  ecmaVersion: "latest",
  sourceType: "module",
  globals: {
    ...globals.node,
  },
};

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      // Generated Prisma client ships .js artifacts; do not lint with TS-oriented rules.
      "**/infrastructure/persistence/generated/**",
      "**/.codemation/**",
    ],
  },

  js.configs.recommended,

  // Block browser blocking dialogs (use in-app UI instead). next-host additionally forbids native <select> via no-restricted-syntax (use @/components/ui/select).
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "no-alert": "error",
    },
  },

  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: baseLanguageOptions,
  },

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ...baseLanguageOptions,
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      codemation: architecturePlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Baseline should be low-noise; tighten later once core is cleaned up.
      "@typescript-eslint/no-explicit-any": "off",
      "no-undef": "off",
      // Prefer the TS-aware variant.
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // One class per file (all source; tests are excluded — kits often use multiple helper classes).
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/*.d.ts",
      "**/test/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
    ],
    plugins: {
      codemation: architecturePlugin,
    },
    rules: {
      "codemation/single-class-per-file": "error",
    },
  },

  // React: one module-scope component per file, bounded file size (layout/logic belong in separate modules).
  {
    files: ["**/*.tsx"],
    ignores: [
      "**/*.test.tsx",
      "**/test/**/*.tsx",
      // Hook modules kept as .tsx for workspace tooling; they are not "component" files.
      "**/use*.tsx",
    ],
    plugins: {
      codemation: architecturePlugin,
    },
    rules: {
      "max-lines": [
        "error",
        {
          max: 250,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "codemation/single-react-component-per-file": "error",
    },
  },

  // Test stability + ergonomics
  {
    files: ["**/test/**/*.{js,ts,tsx}", "**/*.test.{js,ts,tsx}"],
    plugins: {
      "no-only-tests": noOnlyTests,
    },
    rules: {
      // Prevent accidentally committed focused tests.
      "no-only-tests/no-only-tests": "error",
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "VariableDeclarator[init.type='ObjectExpression'][id.typeAnnotation.typeAnnotation.typeName.name='WorkflowDefinition']",
          message:
            "Prefer WorkflowBuilder helpers such as chain(), dag(), or createWorkflowBuilder() in tests instead of manually wiring WorkflowDefinition objects.",
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "test", property: "only", message: "Do not commit focused tests (test.only)." },
        { object: "describe", property: "only", message: "Do not commit focused tests (describe.only)." },
        { object: "it", property: "only", message: "Do not commit focused tests (it.only)." },
        {
          object: "vi",
          property: "mock",
          message: "Prefer dependency injection seams and register fakes in the container instead of using vi.mock().",
        },
        {
          object: "vi",
          property: "doMock",
          message:
            "Prefer dependency injection seams and register fakes in the container instead of using vi.doMock().",
        },
        {
          object: "vi",
          property: "stubGlobal",
          message:
            "Do not use vi.stubGlobal: save the prior globalThis value, assign the test double, and restore in afterEach/finally so parallel and non-isolated Vitest runs stay deterministic.",
        },
        {
          object: "vi",
          property: "unstubAllGlobals",
          message:
            "Do not use vi.unstubAllGlobals: pair each global override with an explicit restore of the saved value (afterEach or try/finally).",
        },
        {
          object: "vi",
          property: "stubEnv",
          message:
            "Do not stub process.env via vi.stubEnv; pass env through harness constructors or copy/restore process.env keys explicitly.",
        },
        { object: "Math", property: "random", message: "Avoid nondeterminism in tests (use deterministic factories)." },
        {
          object: "Date",
          property: "now",
          message: "Avoid nondeterminism in tests (inject clock or use deterministic factories).",
        },
      ],
    },
  },

  // DI + no root/exported functions: all workspace packages except next-host and apps/ (apps live outside packages/**).
  {
    files: ["packages/**/src/**/*.{ts,tsx}"],
    ignores: ["packages/next-host/**", "**/index.ts", "**/*.d.ts", "**/*Types.ts", "**/*types.ts"],
    rules: {
      "codemation/no-manual-di-new": "error",
      "codemation/no-static-methods": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program > FunctionDeclaration",
          message: "Root-level functions are not allowed. Use classes + DI (inject collaborators) instead.",
        },
        {
          selector: "Program > VariableDeclaration > VariableDeclarator[init.type='ArrowFunctionExpression']",
          message: "Root-level functions are not allowed. Use classes + DI (inject collaborators) instead.",
        },
        {
          selector: "Program > VariableDeclaration > VariableDeclarator[init.type='FunctionExpression']",
          message: "Root-level functions are not allowed. Use classes + DI (inject collaborators) instead.",
        },
        {
          selector: "ExportNamedDeclaration > FunctionDeclaration",
          message: "Exported functions are not allowed. Export classes/tokens and use DI instead.",
        },
        {
          selector: "ExportDefaultDeclaration > FunctionDeclaration",
          message: "Exported functions are not allowed. Export classes/tokens and use DI instead.",
        },
        {
          selector:
            "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[init.type='ArrowFunctionExpression'], ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[init.type='FunctionExpression']",
          message: "Exported functions are not allowed. Export classes/tokens and use DI instead.",
        },
      ],
    },
  },

  // Documented exceptions: path catalog + hot runtime construction are intentional.
  // Backend / server libraries: use DI loggers (LoggerFactory, domain log tokens), not raw console.log.
  // next-host (React/UI) and cli (user-facing stdout) are out of scope; browser logging uses BrowserLoggerFactory when wired.
  {
    files: [
      "packages/core/src/**/*.ts",
      "packages/core-nodes/src/**/*.ts",
      "packages/core-nodes-gmail/src/**/*.ts",
      "packages/eventbus-redis/src/**/*.ts",
      "packages/node-example/src/**/*.ts",
      "packages/host/src/**/*.ts",
    ],
    ignores: ["**/test/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "console",
          property: "log",
          message:
            "Avoid console.log. Inject LoggerFactory (see packages/host/src/application/logging/Logger.ts) or a domain Logger token and call logger.info/warn/error/debug; server code should resolve ServerLoggerFactory from the container.",
        },
      ],
    },
  },

  {
    files: ["packages/host/src/**/*.ts"],
    ignores: [
      "**/test/**",
      "**/*.test.ts",
      "packages/host/src/bootstrap/CodemationBootstrapRequest.ts",
      "packages/host/src/presentation/server/CodemationConsumerConfigLoader.ts",
      "packages/host/src/presentation/server/CodemationPluginDiscovery.ts",
      "packages/host/src/presentation/server/DevelopmentRuntimeRouteGuard.ts",
      "packages/host/src/application/dev/DevBootstrapSummaryAssembler.ts",
      "packages/host/src/infrastructure/logging/LogLevelPolicy.ts",
      "packages/host/src/infrastructure/logging/PerformanceLogPolicy.ts",
      "packages/host/src/infrastructure/persistence/PrismaMigrationDeployer.ts",
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Do not read process.env directly here. Resolve consumer/runtime environment at the boundary and pass AppConfig.env or an explicit env snapshot into deeper services.",
        },
      ],
    },
  },

  {
    files: ["packages/next-host/src/**/*.{ts,tsx}", "packages/next-host/app/**/*.{ts,tsx}"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "packages/next-host/src/auth/edgeAuth.ts",
      "packages/next-host/src/auth/nextAuth.ts",
      "packages/next-host/src/auth/AuthSnapshotReader.ts",
      "packages/next-host/src/auth/AuthSnapshotResolver.ts",
      "packages/next-host/src/server/CodemationNextHost.ts",
      "packages/next-host/src/features/workflows/hooks/realtime/useWorkflowRealtimeInfrastructure.ts",
      "packages/next-host/src/providers/Providers.tsx",
      "packages/next-host/src/shell/CodemationNextClientShell.tsx",
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Do not read process.env directly in Next shell/UI modules. Consume the host-provided auth/shell snapshot or an explicit browser-safe env boundary instead.",
        },
      ],
    },
  },

  {
    files: [
      "packages/core/src/**/*.ts",
      "packages/core-nodes/src/**/*.ts",
      "packages/core-nodes-gmail/src/**/*.ts",
      "packages/eventbus-redis/src/**/*.ts",
      "packages/node-example/src/**/*.ts",
      "packages/cli/src/**/*.ts",
      "packages/runtime-dev/src/**/*.ts",
      "packages/dev-gateway/src/**/*.ts",
      "packages/create-codemation/src/**/*.{ts,tsx,js,mjs}",
      "apps/**/*.{ts,tsx,js,mjs}",
    ],
    ignores: [
      "**/test/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "packages/cli/src/dev/DevAuthSettingsLoader.ts",
      "packages/cli/src/dev/DevNextHostEnvironmentBuilder.ts",
      "packages/cli/src/commands/DevCommand.ts",
      "packages/cli/src/commands/ServeWebCommand.ts",
      "packages/cli/src/commands/ServeWorkerCommand.ts",
      "packages/cli/src/commands/UserListCommand.ts",
      "packages/cli/src/runtime/NextHostConsumerServerCommandFactory.ts",
      "packages/cli/src/runtime/TypeScriptRuntimeConfigurator.ts",
      "packages/cli/src/database/DatabaseMigrationsApplyService.ts",
      "packages/cli/src/consumer/ConsumerCliTsconfigPreparation.ts",
      "packages/cli/src/user/UserAdminCliBootstrap.ts",
      "packages/runtime-dev/src/RuntimeDevHost.ts",
      "packages/runtime-dev/src/RuntimeDevServerMain.ts",
      "packages/dev-gateway/src/CodemationDevGateway.ts",
      "packages/create-codemation/src/NodeChildProcessRunner.ts",
      "apps/test-dev/codemation.config.ts",
      "apps/e2e/codemation.config.ts",
      "apps/test-dev/src/gmail/GmailTriggerEnvReader.ts",
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Do not read process.env directly in source modules. Resolve env at the boundary and inject it, or locally disable this rule when the file is the justified boundary.",
        },
      ],
    },
  },

  {
    files: [
      "packages/core/src/engine/runtime/EngineRuntimeRegistrar.ts",
      "packages/core/src/engine/runtime/EngineRuntimeEngineBinding.ts",
      "packages/core/src/engine/runtime/EngineRuntimeExecutionLimitsRegistration.ts",
      "packages/core/src/engine/runtime/EngineRuntimeIntentServicesBinding.ts",
      "packages/core/src/engine/runtime/runtimeEngine.ts",
    ],
    rules: {
      "codemation/no-manual-di-new": "off",
    },
  },
  {
    files: ["packages/host/src/credentials.ts"],
    rules: {
      "codemation/no-manual-di-new": "off",
    },
  },
  {
    files: ["packages/host/src/infrastructure/persistence/PrismaMigrationDeployer.ts"],
    rules: {
      // PGlite + PGLiteSocketServer are third-party library constructors; not container-managed DI.
      "codemation/no-manual-di-new": "off",
    },
  },
  {
    files: ["packages/host/src/presentation/http/ApiPaths.ts"],
    rules: {
      "codemation/no-static-methods": "off",
    },
  },
  {
    files: ["packages/host/src/presentation/server/DevelopmentRuntimeRouteGuard.ts"],
    rules: {
      "codemation/no-static-methods": "off",
    },
  },

  // Fixed consumer for Playwright (packages/e2e): same workflow DSL + slot components as apps/test-dev,
  // which live outside packages/** and are not subject to the strict packages/** OOP rules above.
  {
    files: ["packages/e2e/**/*.{ts,tsx}"],
    rules: {
      "codemation/no-manual-di-new": "off",
      "codemation/no-static-methods": "off",
      "no-restricted-syntax": "off",
    },
  },

  // next-host: UI uses the HTTP API only (App Router → /api → Hono/CQRS), not Server Actions.
  {
    files: ["packages/next-host/**/*.{ts,tsx}"],
    plugins: {
      codemation: architecturePlugin,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExpressionStatement[expression.type='Literal'][expression.value='use server']",
          message:
            'Use the HTTP API (/api/*) and @codemation/host handlers only; do not add Server Actions ("use server").',
        },
      ],
      "codemation/no-native-tooltip-title-attribute": "error",
    },
  },
];
