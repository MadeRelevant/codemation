---
name: codemation-credential-development
description: Guides Codemation custom credential development with `defineCredential(...)`, typed sessions, credential testing, and node credential slots. Use when creating or updating custom credentials, credential registrations, or credential-aware custom nodes.
compatibility: Designed for Codemation apps and plugins that register typed credentials.
tags: credential, oauth, plugin
---

# Codemation Credential Development

## Mental model

A credential type is a schema + runtime adapter: it declares `public` config (e.g. OAuth client id), `secret` material (e.g. tokens), a `createSession(...)` factory that returns the typed object nodes consume, and a `test(...)` function for pre-activation validation. Nodes declare named credential slots; operators bind concrete instances to those slots in the UI. The binding key is `(workflowId, nodeId, slotKey)`.

## When to use / when NOT

Use this skill for defining new credential types, wiring them into apps or plugins, and teaching nodes to request typed credential sessions.
Do not use for general workflow authoring unless credential slots or runtime sessions are the core problem.

## Quickstart

No standalone snippet — the full `defineCredential(...)` shape is in `references/credential-patterns.md`. Use your harness's example-discovery tool for runnable examples: `find_examples({ query: "defineCredential" })` or `find_examples({ query: "credential slot" })`.

## Authoring rules

1. Start with `defineCredential(...)`.
2. Keep `public` versus `secret` fields intentional.
3. Make `createSession(...)` return the typed runtime object the node actually needs.
4. Implement `test(...)` so failure states are explicit before workflow activation.
5. Register credential types at the app or plugin boundary, not inside random workflow files.

## Decision branches & gotchas

**Node integration:** helper-defined nodes declare credentials directly in the `credentials` field; class-based nodes use lower-level credential requirement APIs when needed.

**Binding stability:** the `nodeId` defaults to a slug of the node's `name` label. Renaming a credential-using node's label silently changes its id and orphans the binding in the UI. To prevent this, set an explicit `id:` on credential-using node configs so the id is decoupled from the label.

## Anti-patterns

- Do not hard-code secrets in node implementation — use credential slots.
- Do not register credential types inside workflow files — use the app or plugin composition root.

## Read next when needed

- Read `references/credential-patterns.md` for schema, registration, and slot guidance.
