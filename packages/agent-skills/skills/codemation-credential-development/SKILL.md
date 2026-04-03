---
name: codemation-credential-development
description: Guides Codemation custom credential development with `defineCredential(...)`, typed sessions, credential testing, and node credential slots. Use when creating or updating custom credentials, credential registrations, or credential-aware custom nodes.
compatibility: Designed for Codemation apps and plugins that register typed credentials.
---

# Codemation Credential Development

## Use this skill when

Use this skill for defining new credential types, wiring them into apps or plugins, and teaching nodes to request typed credential sessions.

Do not use this skill for general workflow authoring unless credential slots or runtime sessions are the core problem.

## Core mental model

1. A credential type defines public config, secret material, session creation, and health testing.
2. Nodes request credentials through named slots instead of hard-coded secrets.
3. Operators configure concrete credential instances in the UI and bind them to those slots.

## Authoring rules

1. Start with `defineCredential(...)`.
2. Keep `public` versus `secret` fields intentional.
3. Make `createSession(...)` return the typed runtime object the node actually needs.
4. Implement `test(...)` so failure states are explicit before workflow activation.
5. Register credential types at the app or plugin boundary, not inside random workflow files.

## Node integration

- helper-defined nodes can declare credentials directly in `credentials`
- class-based nodes can use lower-level credential requirement APIs when needed

## Read next when needed

- Read `references/credential-patterns.md` for schema, registration, and slot guidance.
