#!/usr/bin/env sh
# Fail when releasable package files change without a .changeset/*.md in scope.
# - CI (CHANGESET_VERIFY_MODE=ci): same file set as .github/workflows/ci.yml changeset-verify (PR diff vs base).
# - Local (default): merge-base..HEAD plus staged files (what the PR would contain after this commit).
#
# Releasable paths must stay aligned with .changeset/config.json ignore list and CI.
#
# Escape hatch: SKIP_CHANGESET_VERIFY=1

set -eu

RELEASABLE_PACKAGE_REGEX='^packages/(agent-skills|cli|core|core-nodes|core-nodes-gmail|eventbus-redis|host|next-host|node-example|create-codemation)/'

if [ "${SKIP_CHANGESET_VERIFY:-}" = "1" ]; then
  echo "changeset-verify: skipped (SKIP_CHANGESET_VERIFY=1)."
  exit 0
fi

if [ -n "${CHANGESET_VERIFY_CHANGED_FILES:-}" ]; then
  CHANGED_FILES="${CHANGESET_VERIFY_CHANGED_FILES}"
elif [ "${CHANGESET_VERIFY_MODE:-}" = "ci" ]; then
  BASE_REF="${GITHUB_BASE_REF:-main}"
  CHANGED_FILES="$(git diff --name-only "origin/${BASE_REF}...HEAD")"
else
  BASE_REF="${CHANGESET_BASE_BRANCH:-main}"
  git fetch origin "${BASE_REF}:${BASE_REF}" 2>/dev/null || true
  MERGE_BASE="$(git merge-base HEAD "${BASE_REF}" 2>/dev/null || git merge-base HEAD "origin/${BASE_REF}" 2>/dev/null || true)"
  if [ -z "${MERGE_BASE}" ]; then
    echo "changeset-verify: could not resolve merge-base with ${BASE_REF}; skipping."
    exit 0
  fi
  CHANGED_FILES=$( {
    git diff --name-only "${MERGE_BASE}"...HEAD
    git diff --cached --name-only
  } | sort -u )
fi

if [ -z "${CHANGED_FILES}" ]; then
  exit 0
fi

CHANGEDSET_FILES="$(printf '%s\n' "${CHANGED_FILES}" | grep -E '^\.changeset/[^/]+\.md$' || true)"
if [ -n "${CHANGEDSET_FILES}" ]; then
  set -- ./node_modules/.pnpm/@changesets+parse@*/node_modules/@changesets/parse/dist/changesets-parse.cjs.js
  if [ ! -e "$1" ]; then
    echo "changeset-verify: could not resolve the local @changesets/parse module."
    echo "Run: pnpm install"
    exit 1
  fi
  CHANGESET_PARSE_MODULE_PATH="$1"
  printf '%s\n' "${CHANGEDSET_FILES}" | while IFS= read -r CHANGEDSET_FILE; do
    if [ ! -f "${CHANGEDSET_FILE}" ]; then
      continue
    fi
    if ! node -e "const fs = require('node:fs'); const parse = require(process.argv[1]).default; parse(fs.readFileSync(process.argv[2], 'utf8'));" "${CHANGESET_PARSE_MODULE_PATH}" "${CHANGEDSET_FILE}" >/dev/null 2>&1; then
      echo "changeset-verify: changed .changeset/*.md files must be parseable by Changesets."
      echo "Run: pnpm exec changeset status"
      echo "Invalid changeset file: ${CHANGEDSET_FILE}"
      exit 1
    fi
  done
fi

CHANGED_RELEASABLE="$(printf '%s\n' "${CHANGED_FILES}" | grep -E "${RELEASABLE_PACKAGE_REGEX}" || true)"
if [ -z "${CHANGED_RELEASABLE}" ]; then
  exit 0
fi

if [ -n "${CHANGEDSET_FILES}" ]; then
  exit 0
fi

echo "changeset-verify: releasable package paths changed without a .changeset/*.md in this change set."
echo "Add: pnpm changeset   (and stage the new .changeset/*.md), or set SKIP_CHANGESET_VERIFY=1 to bypass."
echo "Touched releasable paths:"
printf '%s\n' "${CHANGED_RELEASABLE}"
exit 1
