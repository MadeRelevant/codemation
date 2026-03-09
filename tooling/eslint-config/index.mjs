import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import noOnlyTests from "eslint-plugin-no-only-tests";

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
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Baseline should be low-noise; tighten later once core is cleaned up.
      "@typescript-eslint/no-explicit-any": "off",
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
        { object: "Math", property: "random", message: "Avoid nondeterminism in tests (use deterministic factories)." },
        { object: "Date", property: "now", message: "Avoid nondeterminism in tests (inject clock or use deterministic factories)." },
      ],
    },
  },

  // Architecture: no top-level or exported functions in engine code.
  // Use classes + DI to keep boundaries explicit and testable.
  {
    files: ["packages/core/src/engine/**/*.{ts,tsx}"],
    rules: {
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

  // Architecture: prefer class-based APIs for queue implementations too.
  {
    files: ["packages/queue-bullmq/src/**/*.{ts,tsx}"],
    rules: {
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

