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
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/api/CodemationApiClient.ts", "src/components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Use @/components/ui/select (Radix/shadcn) instead of native <select> for consistent styling, keyboard behavior, and testability.",
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message:
            "Use @/components/ui/input with FormField/FormControl from @/components/ui/form (see packages/next-host/docs/FORMS.md) instead of raw <input>.",
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message:
            "Use @/components/ui/textarea with FormField/FormControl from @/components/ui/form (see packages/next-host/docs/FORMS.md) instead of raw <textarea>.",
        },
      ],
    },
  },
];
