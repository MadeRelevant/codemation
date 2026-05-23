import base from "@codemation/eslint-config";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  ...base,
  {
    // canvas-core is a headless package — no JSX/TSX files allowed.
    // Any *.tsx file in this package is a build error.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "canvas-core must not contain *.tsx files. Move JSX to @codemation/canvas (canvas-ui). Rename this file to .ts if it contains no JSX.",
        },
      ],
    },
  },
  {
    // canvas-core must not import from .tsx files (e.g. from canvas-ui screens).
    // Headless hooks/types must not depend on rendering code.
    // This is orthogonal to the rule above: that rule prevents .tsx files from
    // existing here; this rule prevents .ts files from importing .tsx modules.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "\\.tsx$",
              message:
                "canvas-core (.ts) must not import from .tsx files. JSX belongs in @codemation/canvas (canvas-ui), not in the headless core.",
            },
          ],
        },
      ],
    },
  },
];
