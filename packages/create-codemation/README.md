# create-codemation

Scaffolds a Codemation consumer application. Published as the `create-codemation` npm package so users can run:

```bash
npm create codemation@latest
# or
pnpm create codemation
# or
yarn create codemation
```

## Usage

```bash
npm create codemation@latest my-app -- --template default
```

- **`[directory]`** — target folder (default: `codemation-app`).
- **`--template <id>`** — `default` or `minimal` (see `templates/` in this package).
- **`--list-templates`** — print available template ids and exit.
- **`--force`** — allow writing into a non-empty directory (overwrites on conflict).

## Development (this monorepo)

```bash
pnpm --filter create-codemation build
pnpm --filter create-codemation test
node packages/create-codemation/bin/create-codemation.js /tmp/out --template minimal
```

## Templates

Templates live under `templates/<id>/` and are shipped in the npm tarball (`files` in `package.json`). Add a new directory there and document the id in this README.
