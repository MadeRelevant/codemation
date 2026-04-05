# Better Auth on the Codemation host

Codemation uses Better Auth as the protocol owner for `/api/auth/*`.

## Ownership

| Area                                                                             | Owner                  |
| -------------------------------------------------------------------------------- | ---------------------- |
| OAuth/OIDC redirects, session cookies, callback URLs, Better Auth route handlers | `better-auth`          |
| `accountStatus`, invites, bootstrap users, and session eligibility rules         | Codemation domain code |

Better Auth stores users, sessions, accounts, and verification records in the same Prisma database the host already uses. Codemation applies policy checks around those records, especially for `active`, `invited`, and `inactive` accounts.

## Public origin configuration

| Variable                     | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `AUTH_SECRET`                | Required signing secret in production.                                   |
| `BETTER_AUTH_URL`            | Explicit public origin for Better Auth.                                  |
| `CODEMATION_PUBLIC_BASE_URL` | Fallback public origin used when `BETTER_AUTH_URL` is not set.           |
| `AUTH_URL`                   | Public base URL used by `packages/next-host` server-side URL resolution. |

`CodemationBetterAuthBaseUrlPolicy` resolves Better Auth's public origin from `BETTER_AUTH_URL` first and `CODEMATION_PUBLIC_BASE_URL` second. It logs warnings when:

- a configured value is not a valid origin,
- both values resolve to different origins,
- production has no valid public origin.

Use the browser-facing origin for these values. A mismatched origin can break callback URLs, redirect targets, or cookie scope.

## Login and logout facade

Codemation keeps `POST /api/auth/login` and `POST /api/auth/logout` as thin host routes. These routes:

- issue and verify the `codemation.csrf-token` cookie,
- forward the request into Better Auth,
- return Better Auth cookies to the browser.

The frontend can also call the native Better Auth routes directly where that is cleaner.

## Reverse proxies

The host enables Better Auth `trustedProxyHeaders`. If TLS terminates at a proxy, forward `X-Forwarded-Proto` and `X-Forwarded-Host` consistently so Better Auth reconstructs the same origin the browser sees.

Built-in Better Auth rate limiting is disabled in the host factory. Apply rate limiting at the reverse proxy or gateway if production requires brute-force protection.

## Persistence

- PostgreSQL and SQLite each have their own Prisma schema and migration history under `packages/host/prisma/`.
- Apply the host migrations before deploying the auth surface.
- SQLite is supported for single-process local development and scaffolded apps.
- Postgres is the right default when multiple processes or shared infrastructure are required.

## What Codemation still owns

- `UserInvite`
- `accountStatus`
- bootstrap local user creation
- the dual-write from `User.passwordHash` to the Better Auth credential account row

Those behaviors are not Better Auth plugins. They are Codemation rules applied around Better Auth.

## Proof in this repository

- `packages/host/test/http/authHttp.integration.test.ts`
- `packages/host/test/http/authHttp.sqlite.integration.test.ts`
- `packages/host/test/http/userManagement.integration.test.ts`
- `packages/host/test/infrastructure/CodemationBetterAuthBaseUrlPolicy.test.ts`
- `packages/cli/test/devNextHostEnvironmentBuilder.test.ts`
