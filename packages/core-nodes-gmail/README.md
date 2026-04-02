# `@codemation/core-nodes-gmail`

Optional **Gmail** integration for Codemation: a polling-based “new mail” trigger and supporting types/services. It talks to the Gmail API and is distributed as a **plugin** package the host can discover alongside your consumer app.

## At a glance

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    On-new-mail trigger (polling)                         │
  └─────────────────────────────────────────────────────────────────────────┘

       ┌──────────────┐         poll on an interval (e.g. ~60s)
       │   Scheduler  │────────────────────────────────────┐
       │  (timer loop)│                                    │
       └──────────────┘                                    ▼
                                                    ┌──────────────┐
   OAuth / API key ─────────────────────────────────►│ Gmail API    │
   (host credentials)                                │ (list + get │
                                                    │  messages)  │
                                                    └──────┬───────┘
                                                           │
                     GmailPollingService                   │ new IDs vs
                     compares message IDs                  │ stored state
                     (baseline pass, then deltas)         ▼
                                                    ┌──────────────┐
                                                    │ emit(items) │
                                                    │  → engine    │
                                                    └──────┬───────┘
                                                           │
                                                           ▼
                                                    workflow runs
                                                    from trigger
```

**Setup:** `setup()` wires the poller and persists **trigger setup state** (processed message IDs, mailbox cursor) so restarts do not duplicate work. **Execute:** the trigger node receives **items produced by polls** (not manual runs without items); attachments are resolved in the execute path.

## Install

```bash
pnpm add @codemation/core-nodes-gmail@^0.0.0
# or
npm install @codemation/core-nodes-gmail@^0.0.0
```

## When to use

Use this package when workflows should start from Gmail messages and you are fine with **polling** (not push/Pub/Sub). Install the package, let Codemation auto-discover it through `codemation.plugin.ts`, and configure Gmail credentials as documented in the host UI and your deployment.

## Usage

```bash
pnpm add @codemation/core-nodes-gmail
```

The package exposes a `codemation.plugin.ts` entry for discovery. Trigger behavior and credential shapes are defined in this package’s source (`GmailNodes`, `OnNewGmailTrigger`, credential types).
