import base from "@codemation/eslint-config";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/api/CodemationApiClient.ts"],
    rules: {
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
      ],
    },
  },
];
