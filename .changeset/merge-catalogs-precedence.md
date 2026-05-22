---
"@codemation/host": minor
---

Wire `ControlPlaneCatalogFetcher` into app bootstrap so credential-type overrides fetched from the control plane take highest precedence in `CredentialTypeRegistryImpl` (control plane > consumer config > framework default). Add `applyControlPlaneOverrides` to `CredentialTypeRegistryImpl` — full replacement per typeId, preserving runtime callbacks.
