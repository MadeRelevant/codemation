"@codemation/next-host": patch

---

Fix live workflow binary links so run-backed attachments open from the run binary endpoint instead of the debugger overlay endpoint, which avoids 404s for Gmail and other real execution binaries.
