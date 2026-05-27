---
"@codemation/host": patch
---

fix(host): defer REDIS_URL parsing in HitlTimeoutJobScheduler constructor

Constructor previously called `RedisConnectionOptionsFactory.fromConfig` eagerly,
which throws "Invalid URL" when `REDIS_URL=""` is set (as the browser e2e
preparer does for `codemation user create`). URL parsing now runs lazily on
first `enqueueTimeoutJob`/`cancelTimeoutJob` call, matching the deferred-throw
pattern already applied to `HitlResumeTokenSigner`. Adds a unit test covering
construction with empty / missing `REDIS_URL`.
