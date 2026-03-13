import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import noOnlyTests from "eslint-plugin-no-only-tests";
import path from "node:path";

const allowedConstructorNames = new Set(["ApplicationRequestError", "Date", "Error", "Map", "Promise", "RegExp", "Set", "URL", "WeakMap", "WeakSet", "WebSocketServer"]);
const compositionRootFilePattern =
  /(?:Factory|Builder|Bootstrap|Discovery|Runner|Server|Gateway|Mapper|Reader|Writer|Finder|Registry|Host|Protocol|Session|Program|Supervisor|Planner|Resolver|Environment|Worker|Scheduler|Connection|Application|Hub|Reporter|Loader|Validator)\.tsx?$/;
const normalizedFilePath = (filename) => filename.replace(/\\/g, "/");
const hasAllowedSuffix = (filename, suffixes) => suffixes.some((suffix) => filename.endsWith(suffix));
const staticMethodAllowedFileSuffixes = [
  "/packages/frontend/src/infrastructure/server/http/ApiPaths.ts",
  "/packages/frontend/src/presentation/http/ApiPaths.ts",
  "/packages/frontend/src/presentation/http/HandlesHttpRoute.ts",
  "/packages/frontend/src/presentation/http/Route.ts",
];
const runtimeRegistryAllowedFileSuffixes = [
  "/packages/frontend/src/CodemationApp.ts",
  "/packages/frontend/src/runtime/codemationRuntimeRegistry.ts",
];
const codemationAppStaticBoundaryFileSuffix = "/packages/frontend/src/CodemationApp.ts";
const isCompositionRootFile = (filename) => compositionRootFilePattern.test(filename) || /\/src\/bin\/[^/]+\.tsx?$/.test(filename);
const allowsStaticMethods = (filename) => isCompositionRootFile(filename) || hasAllowedSuffix(filename, staticMethodAllowedFileSuffixes);
const allowsManualConstruction = (filename) => isCompositionRootFile(filename) || filename.endsWith(codemationAppStaticBoundaryFileSuffix);
const allowsRuntimeRegistryImport = (filename) => hasAllowedSuffix(filename, runtimeRegistryAllowedFileSuffixes);
const isRuntimeRegistryImport = (source) =>
  typeof source === "string" &&
  (source === "./runtime/codemationRuntimeRegistry" ||
    source === "../runtime/codemationRuntimeRegistry" ||
    source.endsWith("/runtime/codemationRuntimeRegistry"));
const restrictedTestingLibraryTextQueries = new Set(["getByText", "queryByText", "findByText"]);
const frontendLayerNames = new Set(["application", "domain", "infrastructure", "ui"]);
const frontendLayerRegex = /\/packages\/frontend\/src\/(application|domain|infrastructure|ui)\//;
const frontendLayerImportRules = {
  domain: {
    allowedLocalTargets: new Set(["domain"]),
    allowedPackagePrefixes: ["@codemation/core"],
  },
  application: {
    allowedLocalTargets: new Set(["application", "domain"]),
    allowedPackagePrefixes: ["@codemation/core"],
  },
  infrastructure: {
    allowedLocalTargets: new Set(["infrastructure", "application", "domain"]),
    allowedPackagePrefixes: null,
  },
  ui: {
    allowedLocalTargets: new Set(["ui", "application", "domain"]),
    allowedPackagePrefixes: null,
  },
};
const frontendLayerRuleIgnoredFileSuffixes = [
  "/packages/frontend/src/codemationApplication.ts",
  "/packages/frontend/src/applicationTokens.ts",
  "/packages/frontend/src/realtimeRuntimeFactory.ts",
  "/packages/frontend/src/client.ts",
  "/packages/frontend/src/server.ts",
  "/packages/frontend/src/application/RealtimeReadyService.ts",
  "/packages/frontend/src/application/WebhookCommandService.ts",
];
const getFrontendLayerForFile = (filename) => {
  const match = normalizedFilePath(filename).match(frontendLayerRegex);
  return match?.[1] ?? null;
};
const isFrontendLayerRuleIgnored = (filename) => hasAllowedSuffix(normalizedFilePath(filename), frontendLayerRuleIgnoredFileSuffixes);
const resolveImportPath = (filename, source) => {
  if (!source.startsWith(".")) return null;
  const extensionlessPath = normalizedFilePath(path.resolve(path.dirname(filename), source));
  if (frontendLayerNames.has(path.basename(extensionlessPath))) {
    return `${extensionlessPath}/index`;
  }
  return extensionlessPath;
};
const hasAllowedPackagePrefix = (source, prefixes) => prefixes?.some((prefix) => source === prefix || source.startsWith(`${prefix}/`)) ?? true;
const isModuleScopeVariableDeclarator = (node) => {
  const declaration = node.parent;
  const container = declaration?.parent;
  return declaration?.type === "VariableDeclaration" && (container?.type === "Program" || container?.type === "ExportNamedDeclaration");
};
const containsCodemationAppAccess = (node) => {
  if (!node || typeof node !== "object") return false;
  if (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object?.type === "Identifier" &&
    node.callee.object.name === "CodemationApp"
  ) {
    return true;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (Array.isArray(value)) {
      if (value.some((entry) => containsCodemationAppAccess(entry))) {
        return true;
      }
      continue;
    }
    if (value && typeof value === "object" && containsCodemationAppAccess(value)) {
      return true;
    }
  }
  return false;
};

const architecturePlugin = {
  rules: {
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
                message: "Each source file should declare a single class. Split additional classes into their own files.",
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
        const filename = normalizedFilePath(context.filename ?? context.getFilename());
        if (allowsManualConstruction(filename)) return {};
        return {
          NewExpression(node) {
            if (node.callee.type !== "Identifier") return;
            if (!/^[A-Z]/.test(node.callee.name)) return;
            if (/(Command|Query|RouteDefinition|RoutePattern|RouteSegment)$/.test(node.callee.name)) return;
            if (allowedConstructorNames.has(node.callee.name)) return;
            context.report({
              node,
              message: "Avoid direct construction here. Register the dependency with tsyringe and inject or resolve it through the composition root instead.",
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
        const filename = normalizedFilePath(context.filename ?? context.getFilename());
        if (allowsStaticMethods(filename)) return {};
        return {
          "MethodDefinition[static=true]"(node) {
            context.report({
              node,
              message: "Avoid static methods here. Move the behavior behind an injected class or a composition-root-specific factory.",
            });
          },
        };
      },
    },
    "no-runtime-registry-imports": {
      meta: {
        type: "problem",
        docs: {
          description: "disallow direct runtime registry imports outside the sanctioned facade",
        },
        schema: [],
      },
      create(context) {
        const filename = normalizedFilePath(context.filename ?? context.getFilename());
        if (allowsRuntimeRegistryImport(filename)) return {};
        return {
          ImportDeclaration(node) {
            if (!isRuntimeRegistryImport(node.source.value)) return;
            context.report({
              node,
              message: "Import the static runtime boundary from CodemationApp instead of reaching into CodemationRuntimeRegistry directly.",
            });
          },
        };
      },
    },
    "no-exported-singletons": {
      meta: {
        type: "problem",
        docs: {
          description: "disallow exported singleton instances outside composition roots",
        },
        schema: [],
      },
      create(context) {
        const filename = normalizedFilePath(context.filename ?? context.getFilename());
        if (isCompositionRootFile(filename)) return {};
        return {
          "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator"(node) {
            if (node.init?.type !== "NewExpression") return;
            context.report({
              node,
              message: "Do not export singleton instances here. Keep singleton wiring inside the composition root or the sanctioned static boundary.",
            });
          },
        };
      },
    },
    "no-static-app-capture": {
      meta: {
        type: "problem",
        docs: {
          description: "disallow module-scope capture from the static app boundary",
        },
        schema: [],
      },
      create(context) {
        const filename = normalizedFilePath(context.filename ?? context.getFilename());
        if (filename.endsWith(codemationAppStaticBoundaryFileSuffix)) return {};
        return {
          VariableDeclarator(node) {
            if (!isModuleScopeVariableDeclarator(node)) return;
            if (!containsCodemationAppAccess(node.init)) return;
            context.report({
              node,
              message: "Do not capture CodemationApp values at module scope. Resolve them inside request-time handlers so HMR always sees the latest runtime.",
            });
          },
        };
      },
    },
    "no-testing-library-text-queries": {
      meta: {
        type: "problem",
        docs: {
          description: "disallow brittle Testing Library text queries in tests",
        },
        schema: [],
      },
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee.type === "Identifier" && restrictedTestingLibraryTextQueries.has(node.callee.name)) {
              context.report({
                node,
                message:
                  "Do not use Testing Library text queries here. Add a stable data-testid and query with getByTestId/findByTestId/queryByTestId instead.",
              });
              return;
            }
            if (
              node.callee.type === "MemberExpression" &&
              !node.callee.computed &&
              node.callee.property.type === "Identifier" &&
              restrictedTestingLibraryTextQueries.has(node.callee.property.name)
            ) {
              context.report({
                node,
                message:
                  "Do not use Testing Library text queries here. Add a stable data-testid and query with getByTestId/findByTestId/queryByTestId instead.",
              });
            }
          },
        };
      },
    },
    "no-container-injection": {
      meta: {
        type: "problem",
        docs: {
          description: "disallow injecting the DI container into application classes",
        },
        schema: [],
      },
      create(context) {
        return {
          Decorator(node) {
            if (node.expression?.type !== "CallExpression") return;
            if (node.expression.callee.type !== "Identifier" || node.expression.callee.name !== "inject") return;
            const [firstArgument] = node.expression.arguments;
            if (
              firstArgument?.type === "MemberExpression" &&
              !firstArgument.computed &&
              firstArgument.object.type === "Identifier" &&
              firstArgument.object.name === "CoreTokens" &&
              firstArgument.property.type === "Identifier" &&
              firstArgument.property.name === "ServiceContainer"
            ) {
              context.report({
                node,
                message: "Do not inject the DI container. Resolve dependencies in the composition root and inject typed collaborators instead.",
              });
            }
          },
        };
      },
    },
    "frontend-layer-imports": {
      meta: {
        type: "problem",
        docs: {
          description: "enforce frontend DDD layer import boundaries",
        },
        schema: [],
      },
      create(context) {
        const filename = normalizedFilePath(context.filename ?? context.getFilename());
        if (isFrontendLayerRuleIgnored(filename)) return {};
        const sourceLayer = getFrontendLayerForFile(filename);
        if (!sourceLayer) return {};
        const layerRule = frontendLayerImportRules[sourceLayer];
        if (!layerRule) return {};
        return {
          ImportDeclaration(node) {
            if (typeof node.source.value !== "string") return;
            const source = node.source.value;
            if (source.startsWith(".")) {
              const resolvedImportPath = resolveImportPath(filename, source);
              if (!resolvedImportPath) return;
              if (sourceLayer === "application" && resolvedImportPath.includes("/packages/frontend/src/infrastructure/di/")) return;
              const targetLayer = getFrontendLayerForFile(resolvedImportPath);
              if (!targetLayer) return;
              if (layerRule.allowedLocalTargets.has(targetLayer)) return;
              context.report({
                node,
                message: `\`${sourceLayer}\` code may not import from the \`${targetLayer}\` layer.`,
              });
              return;
            }
            if (source.startsWith("node:")) return;
            if (hasAllowedPackagePrefix(source, layerRule.allowedPackagePrefixes)) return;
            context.report({
              node,
              message: `\`${sourceLayer}\` code may not import package \`${source}\`.`,
            });
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
    ignores: ["**/dist/**", "**/node_modules/**"],
  },

  js.configs.recommended,

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

  // Test stability + ergonomics
  {
    files: ["**/test/**/*.{js,ts,tsx}", "**/*.test.{js,ts,tsx}"],
    plugins: {
      codemation: architecturePlugin,
      "no-only-tests": noOnlyTests,
    },
    rules: {
      // Prevent accidentally committed focused tests.
      "no-only-tests/no-only-tests": "error",
      "codemation/no-testing-library-text-queries": "error",
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
          message: "Prefer dependency injection seams and register fakes in the container instead of using vi.doMock().",
        },
        { object: "Math", property: "random", message: "Avoid nondeterminism in tests (use deterministic factories)." },
        { object: "Date", property: "now", message: "Avoid nondeterminism in tests (inject clock or use deterministic factories)." },
      ],
    },
  },

  // Architecture: package source should stay class-oriented and DI-friendly.
  {
    files: ["packages/frontend/src/**/*.{ts,tsx}", "packages/cli/src/**/*.{ts,tsx}"],
    ignores: [
      "**/index.ts",
      "**/*.d.ts",
      "**/*Types.ts",
      "**/*types.ts",
      "packages/frontend/src/ui/**/*.tsx",
      "packages/frontend/src/application/RunCommandService.ts",
      "packages/frontend/src/infrastructure/di/**/*.ts",
      "packages/frontend/src/infrastructure/server/http/**/*.ts",
      "packages/frontend/src/infrastructure/server/CodemationServerGateway.ts",
      "packages/frontend/src/infrastructure/logging/BrowserLoggerFactory.ts",
    ],
    rules: {
      "codemation/single-class-per-file": "error",
      "codemation/no-manual-di-new": "error",
      "codemation/no-static-methods": "error",
      "codemation/no-runtime-registry-imports": "error",
      "codemation/no-exported-singletons": "error",
      "codemation/no-static-app-capture": "error",
      "codemation/no-container-injection": "error",
      "codemation/frontend-layer-imports": "error",
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
];

