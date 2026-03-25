import base from "@codemation/eslint-config";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  ...base,
  {
    ignores: ["templates/**"],
  },
];
