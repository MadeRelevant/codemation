import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import noOnlyTests from "eslint-plugin-no-only-tests";

const allowedConstructorNames = new Set(["Date", "Error", "Map", "Promise", "RegExp", "Set", "URL", "WeakMap", "WeakSet", "WebSocketServer"]);
const compositionRootFilePattern =
  /(?:Factory|Builder|Bootstrap|Discovery|Runner|Server|Mapper|Reader|Writer|Finder|Registry|Host|Protocol|Session|Program|Supervisor|Planner|Resolver|Environment|Worker|Scheduler|Connection|Application|Hub|Reporter|Loader|Validator)\.tsx?$/;
const normalizedFilePath = (filename) => filename.replace(/\\/g, "/");
const hasAllowedSuffix = (filename, suffixes) => suffixes.some((suffix) => filename.endsWith(suffix));
const staticMethodAllowedFileSuffixes = [
  "/packages/frontend/src/CodemationApp.ts",
  "/packages/frontend/src/api/ApiPaths.ts",
  "/packages/frontend/src/server/WorkflowLoader.ts",
  "/packages/frontend/src/templates/StartRouteTemplateCatalog.ts",
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
      "packages/frontend/src/frontend/routeHandlers.ts",
      "packages/frontend/src/routes/**/*.tsx",
      "packages/frontend/src/components/**/*.tsx",
      "packages/frontend/src/realtime/**/*.tsx",
      "packages/frontend/src/providers/**/*.tsx",
    ],
    rules: {
      "codemation/single-class-per-file": "error",
      "codemation/no-manual-di-new": "error",
      "codemation/no-static-methods": "error",
      "codemation/no-runtime-registry-imports": "error",
      "codemation/no-exported-singletons": "error",
      "codemation/no-static-app-capture": "error",
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

