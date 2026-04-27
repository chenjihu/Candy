# Hard-Cut Cleanup Design

**Date:** 2026-04-27

## Goal

Remove all backward-compatibility code related to the pre-environment repository model and old webhook behavior. After this cleanup, Candy only supports the current environment-based architecture on freshly initialized databases. Old databases are not supported for in-place upgrade.

## Decision

Candy will hard-cut to the current model and stop carrying any compatibility bridge for:

- old `repositories`-centric runtime logic
- old integer repository bridge fields such as `legacyRepositoryID`
- old schema detection and repair migrations
- old webhook compatibility branches such as legacy Gitee token equality validation

This is a source cleanup, schema cleanup, and runtime cleanup together. It is not just a UI or API adjustment.

## Supported Model After Cleanup

The only supported runtime model becomes:

- `environments`
- `repository_sources`
- `environment_repositories`
- `runners`
- `secrets`
- `deploy_jobs`
- `deploy_logs`

### Ownership and relations

- `repository_sources` remains global
- `environment_repositories` belongs to an environment and references a repository source
- `secrets` belongs to an environment and may optionally reference an `environment_repository`
- `deploy_jobs` belongs to an `environment_repository`
- webhook lookup resolves directly by `environment_repositories.webhook_id`
- deployments run directly from `environment_repositories + repository_sources`

Internal SQLite integer keys may still exist for joins, but they must reflect the new model only. No compatibility-only integer bridge may remain.

## Removed Concepts

The following concepts are deleted completely:

- `legacyRepositoryID`
- any runtime dependency on the old `repositories` table as the primary deployment object
- schema-repair logic that tries to infer or rebuild missing `legacy_repository_id`
- schema-repair logic that backfills missing `webhook_id`
- compatibility logic for drifted split-schema tables
- any automatic migration path from flat legacy repositories into repository source plus environment binding
- old Gitee token equality verification path

## Database Direction

Candy will only initialize the current schema. It will no longer attempt to inspect unknown historical schemas and transform them forward.

### Consequences

- new installs work normally
- existing old-version databases are unsupported
- if a user wants to move from an old install, they must rebuild data manually

### Schema expectations

The steady-state schema should express new relations directly:

- `environment_repositories` is the deployment binding root
- `secrets.environment_repository_id` is optional and points to `environment_repositories.id`
- `deploy_jobs.environment_repository_id` points to `environment_repositories.id`
- any joins for names, branch, webhook, logs, and deployment state flow through `environment_repositories`

The old `repositories` table should no longer exist as a compatibility anchor. If retained at all, it must be because the new schema still truly needs it. The preferred outcome is to remove it entirely.

## Backend Cleanup Scope

### `store.go`

- replace migration-heavy startup logic with straightforward schema initialization
- remove drift/schema-repair helpers that only exist for legacy upgrades
- remove any helper that resolves new records back through legacy repository IDs
- update secret storage and deploy job storage to reference `environment_repositories`
- simplify webhook record lookup and deployment record lookup around the new root model

### `api.go`

- remove logic that translates between environment repository public IDs and legacy repository IDs
- operate directly on `environment_repositories`
- keep environment scoping validation
- update delete flows, list flows, and trigger flows to use the final model only

### `webhook.go`

- resolve webhook by `environment_repositories.webhook_id`
- create deployment jobs directly against the bound environment repository
- remove any dependency on legacy repository IDs for delivery dedupe or job creation
- keep only standard GitHub and Gitee signature verification

### `deployer.go`

- fetch repository binding by `environment_repository_id`
- join to `repository_sources` for repo URL and deploy key
- inject environment-scoped secrets resolved by `environment_repository_id`

## Frontend Cleanup Scope

Frontend behavior should not change materially for users, but any old field assumptions should be removed.

Cleanup targets:

- stop consuming any API field that exists only to support old repository bridging
- keep using public opaque IDs only
- keep repository creation/edit flows rooted in repository source plus environment binding
- keep secret scope selection rooted in environment repository public IDs

## Testing Changes

Delete or rewrite tests that only validate upgrade compatibility from old schemas.

Keep or add tests for:

- fresh schema initialization
- environment creation defaults
- repository source and environment repository CRUD
- secret scoping by environment repository
- deploy job creation and lookup by environment repository
- webhook resolution by `webhook_id`
- orphan repository-source cleanup when the last binding is deleted

Explicitly remove tests whose purpose is:

- migrating flat repositories forward
- repairing empty `webhook_id`
- reconstructing `legacyRepositoryID`
- rebuilding split-schema tables from drifted historical variants

## Documentation Changes

Update both READMEs to state clearly:

- Candy now supports only the current environment-based schema
- old databases are not supported for automatic upgrade
- webhook verification supports standard GitHub and Gitee signatures only

Remove wording that implies legacy compatibility, especially around old Gitee token verification or old repository migration behavior.

## Non-Goals

- building an import/export tool
- supporting one-time legacy upgrade
- preserving compatibility code behind feature flags
- redesigning the frontend UX beyond field cleanup

## Risks

### Main risk

Some current runtime paths may still quietly rely on old `repositories.id` semantics even though the product surface already looks migrated.

### Mitigation

Do the cleanup as a full model pass, not as isolated line edits:

- schema
- store queries
- webhook ingestion
- deployment execution
- secrets
- jobs
- tests

## Acceptance Criteria

The cleanup is complete when all of the following are true:

1. No backend runtime code references `legacyRepositoryID` or equivalent bridge concepts.
2. No startup migration logic attempts to transform old repository schemas into the new model.
3. No webhook verification code supports deprecated compatibility behavior.
4. Secrets, jobs, webhook lookup, and deployment execution all operate directly on `environment_repositories`.
5. Fresh backend tests pass.
6. Frontend production build passes.
7. README and README.zh no longer describe legacy compatibility.
