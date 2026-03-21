import base from "@codemation/eslint-config";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  ...base,
  {
    files: ["src/components/ui/**/*.tsx", "src/components/CodemationDialog.tsx"],
    rules: {
      "max-lines": "off",
      "codemation/single-react-component-per-file": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/api/CodemationApiClient.ts"],
    rules: {
      // Complements root `no-alert` (blocks alert/confirm/prompt): prefer Radix/shadcn primitives over native form controls.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExpressionStatement[expression.type='Literal'][expression.value='use server']",
          message:
            'Use the HTTP API (/api/*) and @codemation/host handlers only; do not add Server Actions ("use server").',
        },
        {
          selector: "CallExpression[callee.type='Identifier'][callee.name='fetch']",
          message:
            "Use codemationApiClient from src/api/CodemationApiClient.ts for /api/* calls (same-origin session cookies, JSON, consistent errors). Global fetch() is reserved for that wrapper only.",
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Use @/components/ui/select (Radix/shadcn) instead of native <select> for consistent styling, keyboard behavior, and testability.",
        },
      ],
    },
  },
];
