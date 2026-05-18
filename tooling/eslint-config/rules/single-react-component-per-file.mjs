/**
 * ESLint rule: codemation/single-react-component-per-file
 *
 * Enforces at most one React component per .tsx file. Component families are
 * allowed: if every exported component name starts with the PascalCase prefix
 * derived from the filename, the file is considered a single family and passes.
 *
 * Examples:
 *   dropdown-menu.tsx  → prefix "DropdownMenu" → DropdownMenu, DropdownMenuTrigger, etc. are allowed
 *   table.tsx          → prefix "Table"         → Table, TableRow, TableCell, etc. are allowed
 *   mixed.tsx with Button + Table               → error (different families)
 */

function isPascalCaseComponentName(name) {
  return typeof name === "string" && name.length > 0 && /^[A-Z]/.test(name);
}

function extendsReactComponentClass(superClass) {
  if (!superClass) return false;
  if (superClass.type === "Identifier") {
    return superClass.name === "Component" || superClass.name === "PureComponent";
  }
  if (superClass.type === "MemberExpression" && superClass.property.type === "Identifier" && !superClass.computed) {
    const prop = superClass.property.name;
    return prop === "Component" || prop === "PureComponent";
  }
  return false;
}

function isMemoOrForwardRefCall(node) {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type === "Identifier") {
    return callee.name === "memo" || callee.name === "forwardRef";
  }
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier" && !callee.computed) {
    const prop = callee.property.name;
    return prop === "memo" || prop === "forwardRef";
  }
  return false;
}

/** `const`-based components must use `memo` / `forwardRef` so tiny SVG/icon helpers are not counted. */
function isComponentVariableInit(init) {
  return Boolean(init && init.type === "CallExpression" && isMemoOrForwardRefCall(init));
}

function collectTopLevelReactComponents(program) {
  const components = [];

  function considerStatement(stmt) {
    if (!stmt) return;

    if (stmt.type === "ExportNamedDeclaration") {
      considerStatement(stmt.declaration);
      return;
    }

    if (stmt.type === "ExportDefaultDeclaration") {
      const d = stmt.declaration;
      if (d.type === "FunctionDeclaration" && d.id && isPascalCaseComponentName(d.id.name)) {
        components.push(d);
        return;
      }
      if (d.type === "ClassDeclaration" && d.id && extendsReactComponentClass(d.superClass)) {
        components.push(d);
        return;
      }
      if (d.type === "VariableDeclaration") {
        considerVariableDeclaration(d);
        return;
      }
      if (d.type === "ArrowFunctionExpression" || d.type === "FunctionExpression") {
        components.push(stmt);
        return;
      }
      if (d.type === "CallExpression" && isMemoOrForwardRefCall(d)) {
        components.push(stmt);
      }
      return;
    }

    if (stmt.type === "FunctionDeclaration") {
      if (stmt.id && isPascalCaseComponentName(stmt.id.name)) {
        components.push(stmt);
      }
      return;
    }

    if (stmt.type === "ClassDeclaration") {
      if (stmt.id && extendsReactComponentClass(stmt.superClass)) {
        components.push(stmt);
      }
      return;
    }

    if (stmt.type === "VariableDeclaration") {
      considerVariableDeclaration(stmt);
    }
  }

  function considerVariableDeclaration(decl) {
    for (const d of decl.declarations) {
      if (d.id.type !== "Identifier" || !isPascalCaseComponentName(d.id.name)) continue;
      if (isComponentVariableInit(d.init)) {
        components.push(d);
      }
    }
  }

  for (const stmt of program.body) {
    considerStatement(stmt);
  }

  return components;
}

/**
 * Derive a PascalCase prefix from the file basename.
 * e.g. "dropdown-menu.tsx" → "DropdownMenu"
 *      "table.tsx"         → "Table"
 */
function filenameToPascalPrefix(file) {
  const base = file
    .split("/")
    .pop()
    .replace(/\.tsx$/, "");
  return base
    .split(/[-_]/)
    .map((seg) => (seg.length > 0 ? seg[0].toUpperCase() + seg.slice(1) : ""))
    .join("");
}

/**
 * Extract the component name from a collected node.
 */
function getComponentName(decl) {
  if (decl.type === "FunctionDeclaration" && decl.id) return decl.id.name;
  if (decl.type === "VariableDeclarator" && decl.id && decl.id.type === "Identifier") return decl.id.name;
  if (decl.type === "ExportDefaultDeclaration") {
    const d = decl.declaration;
    if (d && d.type === "FunctionDeclaration" && d.id) return d.id.name;
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const singleReactComponentPerFile = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "allow at most one React component per .tsx file (split helpers into separate files); component families sharing a filename-derived prefix are allowed",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!filename.endsWith(".tsx")) return {};

    return {
      Program(node) {
        const components = collectTopLevelReactComponents(node);
        if (components.length <= 1) return;

        // Allow a component family: all names must share the filename-derived prefix.
        const prefix = filenameToPascalPrefix(filename);
        if (prefix.length > 0) {
          const allInFamily = components.every((c) => {
            const name = getComponentName(c);
            return name !== null && name.startsWith(prefix);
          });
          if (allInFamily) return;
        }

        for (const decl of components.slice(1)) {
          context.report({
            node: decl,
            message:
              "Each .tsx file should define a single React component at module scope. Move additional components (including private helpers) into their own files, or ensure all component names share the filename-derived prefix (e.g. DropdownMenu* in dropdown-menu.tsx).",
          });
        }
      },
    };
  },
};

export default singleReactComponentPerFile;
export { collectTopLevelReactComponents, filenameToPascalPrefix };
