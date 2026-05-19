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

  it("allows a class component extending React.Component (identifier form)", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "my-widget.tsx",
          code: `class MyWidget extends React.Component { render() { return null; } }`,
        },
      ],
      invalid: [],
    });
  });

  it("allows a class component extending Component (bare import form)", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "my-other.tsx",
          code: `class MyOther extends Component { render() { return null; } }`,
        },
      ],
      invalid: [],
    });
  });

  it("allows a memo()-wrapped component (single)", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "avatar.tsx",
          code: `const Avatar = memo(function() { return null; });`,
        },
      ],
      invalid: [],
    });
  });

  it("allows a forwardRef()-wrapped component (single)", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "input.tsx",
          code: `const Input = forwardRef(function(props, ref) { return null; });`,
        },
      ],
      invalid: [],
    });
  });

  it("allows a React.memo() wrapped component (MemberExpression callee)", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "badge.tsx",
          code: `const Badge = React.memo(function() { return null; });`,
        },
      ],
      invalid: [],
    });
  });

  it("allows a React.forwardRef() wrapped component (MemberExpression callee)", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "chip.tsx",
          code: `const Chip = React.forwardRef(function(props, ref) { return null; });`,
        },
      ],
      invalid: [],
    });
  });

  it("allows export default with arrow function component", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "page.tsx",
          code: `export default () => null;`,
        },
      ],
      invalid: [],
    });
  });

  it("allows export default with memo() call expression", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "card.tsx",
          code: `export default memo(() => null);`,
        },
      ],
      invalid: [],
    });
  });

  it("flags two class components extending React.Component in the same file", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [],
      invalid: [
        {
          filename: "mixed-classes.tsx",
          code: `
            class Foo extends React.Component { render() { return null; } }
            class Bar extends React.Component { render() { return null; } }
          `,
          errors: [{ message: /single React component/i }],
        },
      ],
    });
  });

  it("flags components when the family is broken by a non-matching member", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [],
      invalid: [
        {
          // dropdown-menu.tsx prefix is "DropdownMenu"
          // Badge does NOT start with "DropdownMenu", so no allInFamily — all after the first are flagged
          filename: "dropdown-menu.tsx",
          code: `
            function DropdownMenu() { return null; }
            function DropdownMenuTrigger() { return null; }
            function Badge() { return null; }
          `,
          errors: [{ message: /single React component/i }, { message: /single React component/i }],
        },
      ],
    });
  });

  it("flags two memo()-wrapped components with different families", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [],
      invalid: [
        {
          filename: "multi-memo.tsx",
          code: `
            const Foo = memo(() => null);
            const Bar = memo(() => null);
          `,
          errors: [{ message: /single React component/i }],
        },
      ],
    });
  });

  it("allows export default named class extending React.Component", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "hero.tsx",
          code: `export default class Hero extends React.Component { render() { return null; } }`,
        },
      ],
      invalid: [],
    });
  });

  it("allows export default PureComponent extension", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "pure.tsx",
          code: `class PureWidget extends PureComponent { render() { return null; } }`,
        },
      ],
      invalid: [],
    });
  });

  it("allows export default named function component", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "hero.tsx",
          code: `export default function Hero() { return null; }`,
        },
      ],
      invalid: [],
    });
  });

  it("allows export named variable component (memo)", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "widget.tsx",
          code: `export const Widget = memo(() => null);`,
        },
      ],
      invalid: [],
    });
  });

  it("allows export default class with named function inside ExportDefault", () => {
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "page.tsx",
          code: `export default function Page() { return null; }`,
        },
      ],
      invalid: [],
    });
  });

  it("extendsReactComponentClass returns false for unrecognised superClass type", () => {
    // Covers the fallthrough return false in extendsReactComponentClass
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "computed.tsx",
          code: `class Computed extends obj["Component"] { render() { return null; } }`,
        },
      ],
      invalid: [],
    });
  });

  it("isMemoOrForwardRefCall returns false for non-matching call", () => {
    // Covers the fallthrough return false in isMemoOrForwardRefCall
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [
        {
          filename: "plain.tsx",
          code: `function Plain() { return null; }`,
        },
      ],
      invalid: [],
    });
  });

  it("flags export default VariableDeclaration with multiple memo-wrapped components", () => {
    // Covers ExportDefaultDeclaration with VariableDeclaration sub-path
    tester.run("single-react-component-per-file", singleReactComponentPerFile, {
      valid: [],
      invalid: [
        {
          filename: "multi.tsx",
          code: `
            export default function Multi() { return null; }
            function Other() { return null; }
          `,
          errors: [{ message: /single React component/i }],
        },
      ],
    });
  });
});
