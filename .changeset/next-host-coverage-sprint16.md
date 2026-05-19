---
"@codemation/next-host": patch
---

test(next-host): push @codemation/next-host coverage to ≥90% (Sprint 16 Story 01 — next-host work unit)

Add coverage.all: true to vitest.config.ts so all source files count in the denominator, bringing measurement in line with merged-lcov. Document exclusions inline for untestable files (Next.js runtime bootstrap, edge-crypto APIs, canvas hooks requiring router context). Write behavioural tests for: appLayoutPageTitle pure function, WorkflowListItemCard/Root/FolderSection, WorkflowsList states, WorkflowSidebarNavTree/Folder, WorkflowDetailChromeProvider context, UsersScreenUserStatusBadge, UsersRegenerateDialog, CredentialsScreenHealthBadge/TestFailureAlert/InstancesTable, DashboardMetricCard, DashboardWorkflowRunsTable (pagination), DashboardCostAmountFormatter, DashboardDateTimeFormatter, DashboardFilterStorage, CodemationDataTable, CodemationFormattedDateTime, OauthProviderIcon, credentialFieldHelpers, CodemationRuntimeBootstrapClient, CollectionBulkDeleteDialog, CollectionDeleteRowDialog.
