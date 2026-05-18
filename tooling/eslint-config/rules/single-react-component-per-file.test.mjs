/**
 * Tests for codemation/single-react-component-per-file ESLint rule.
 *
 * Uses RuleTester from ESLint (flat-config compatible variant).
 */
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import singleReactComponentPerFile from "./single-react-component-per-file.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

describe("codemation/single-react-component-per-file", () => {
  it("allows a single component in a file", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "button.tsx",
          code: `function Button(props) { return null; }`,
        },
      ],
      invalid: [],
    });
  });

  it("allows a component family where all names share the filename-derived prefix", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          // dropdown-menu.tsx → prefix "DropdownMenu"
          filename: "/src/components/ui/dropdown-menu.tsx",
          code: `
            function DropdownMenu() { return null; }
            function DropdownMenuTrigger() { return null; }
            function DropdownMenuItem() { return null; }
          `,
        },
        {
          // table.tsx → prefix "Table"
          filename: "/src/components/ui/table.tsx",
          code: `
            function Table() { return null; }
            function TableRow() { return null; }
            function TableCell() { return null; }
          `,
        },
        {
          // select.tsx → prefix "Select"
          filename: "/src/ui/select.tsx",
          code: `
            function Select() { return null; }
            function SelectTrigger() { return null; }
            function SelectContent() { return null; }
          `,
        },
      ],
      invalid: [],
    });
  });

  it("flags unrelated components in the same file", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [],
      invalid: [
        {
          // Button and Table are unrelated — neither starts with the other's prefix
          filename: "/src/components/mixed.tsx",
          code: `
            function Button() { return null; }
            function Table() { return null; }
          `,
          errors: [{ message: /single React component/i }],
        },
        {
          // DropdownMenu family + unrelated Badge → error because "Badge" doesn't start with "DropdownMenu"
          // and "DropdownMenu" doesn't start with "DropdownMenu" for "Badge" to form a family.
          // Wait — the prefix is derived from filename "mixed", not from the components.
          // "mixed" → "Mixed"; neither Button nor Table starts with "Mixed" → both flagged after first.
          // This test is intentionally for unrelated in same file.
          filename: "/src/components/button-and-table.tsx",
          code: `
            function Button() { return null; }
            function Table() { return null; }
          `,
          errors: [{ message: /single React component/i }],
        },
      ],
    });
  });

  it("ignores non-tsx files", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "utils.ts",
          code: `function Foo() {} function Bar() {}`,
        },
      ],
      invalid: [],
    });
  });
});
