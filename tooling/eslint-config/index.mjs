import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import noOnlyTests from "eslint-plugin-no-only-tests";

const allowedConstructorNames = new Set(["Date", "Error", "Map", "Promise", "RegExp", "Set", "URL", "WeakMap", "WeakSet", "WebSocketServer"]);
const compositionRootFilePattern =
  /(?:Factory|Builder|Bootstrap|Discovery|Runner|Server|Mapper|Reader|Writer|Finder|Registry|Host|Protocol|Session|Program|Supervisor|Planner|Resolver|Environment|Worker|Scheduler|Connection|Application|Hub|Reporter|Loader|Validator)\.tsx?$/;
const isCompositionRootFile = (filename) => compositionRootFilePattern.test(filename) || /\/src\/bin\/[^/]+\.tsx?$/.test(filename);

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
        const filename = context.filename ?? context.getFilename();
        if (isCompositionRootFile(filename)) return {};
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
        const filename = context.filename ?? context.getFilename();
        if (isCompositionRootFile(filename)) return {};
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
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"],
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
      "no-only-tests": noOnlyTests,
    },
    rules: {
      // Prevent accidentally committed focused tests.
      "no-only-tests/no-only-tests": "error",
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
    ignores: ["**/index.ts", "**/*.d.ts", "**/*Types.ts", "**/*types.ts", "packages/frontend/src/frontend/routeHandlers.ts"],
    rules: {
      "codemation/single-class-per-file": "error",
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
];

