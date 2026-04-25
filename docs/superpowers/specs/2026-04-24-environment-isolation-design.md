# Environment Isolation Design

**Date:** 2026-04-24

**Goal:** Introduce first-class runtime environments such as `Production`, `Staging`, and `Test` so deployment configuration, Runners, Secrets, and deployment history are isolated per environment while repository source definitions and deployment keys can be reused across environments.

## Summary

Candy will add a new top-level resource named `Environment`, but the current flat repository model will be split into two layers:

- a global repository source definition
- an environment-specific deployment binding

The repository source definition stores the Git identity and deployment key once. The environment-specific deployment binding stores the branch, Runner, work directory, deploy script, webhook secret, and webhook endpoint for one environment. Runners, Secrets, and deployment jobs remain environment-owned. Dashboard data is always scoped to the currently selected environment.

The UI will expose an environment switcher in the top bar, persist the current environment, and visually reinforce the selected environment with a distinct edge color around the page. The system will also stop exposing predictable integer identifiers at the API boundary and in webhook URLs, replacing them with opaque random identifiers.

## Objectives

- Support user-defined runtime environments.
- Isolate environment deployment bindings, Runners, Secrets, and jobs by environment.
- Reuse repository source definitions and deployment keys across environments.
- Allow one repository source to deploy different branches in different environments.
- Make the current environment obvious in the UI.
- Prevent easy ID enumeration for environments, repository sources, environment repository bindings, Runners, Secrets, jobs, and webhooks.
- Migrate existing single-environment installs safely into the new model.

## Non-Goals

- Per-environment admin accounts or RBAC.
- Cross-environment resource moves in the first version.
- Force-delete of non-empty environments in the first version.
- Full theme replacement per environment. The environment color is a contextual signal, not a separate brand theme.

## Resource Model

### New `environments` resource

Add a new table and API resource with:

- `id`: internal database key
- `public_id`: opaque external identifier
- `name`: display name, unique
- `slug`: stable human-readable key, unique
- `description`
- `color`: hex color used for context framing in the UI
- `created_at`
- `updated_at`

Recommended defaults for new installs:

- `Production` with `slug=production` and a red accent
- `Staging` with `slug=staging` and a blue accent
- `Test` with `slug=test` and a green accent

For upgrades from existing installs, only one default environment is created automatically:

- `Production` with `slug=production`

### Repository split

Repositories are no longer modeled as one flat object. They are split into:

- `repository_sources`: global source of truth for Git identity and deployment key
- `environment_repositories`: one deployment binding per environment

`repository_sources` contains:

- `id`: internal database key
- `public_id`: opaque external identifier
- `name`: global display name, unique
- `provider`
- `repo_url`
- `deploy_key_cipher`
- `created_at`
- `updated_at`

`environment_repositories` contains:

- `id`: internal database key
- `public_id`: opaque external identifier
- `environment_id`
- `repository_source_id`
- `branch`
- `work_dir`
- `deploy_script`
- `runner_id`
- `clean_worktree`
- `webhook_secret_cipher`
- `webhook_id`
- `created_at`
- `updated_at`

This means one repository source can be connected to multiple environments, each with a different deployment branch and deployment behavior.

### Environment ownership

The following resources become environment-owned:

- environment repository bindings
- runners
- secrets
- deploy jobs

The repository source itself is global and not environment-owned.

Each environment-owned table receives:

- `environment_id`: internal foreign key
- `public_id`: opaque external identifier

The API and UI will only use `public_id`. Internal integer IDs remain private implementation details for SQLite relations and migration stability.

## Identifier Strategy

### Why change IDs

Current integer IDs are easy to enumerate and leak system structure. This is especially risky for webhook endpoints and for any future API surface that exposes related resource IDs.

### Decision

Use opaque string IDs for every externally visible resource:

- environment
- repository source
- environment repository binding
- runner
- secret
- deploy job

Use a separate opaque webhook identifier for webhook delivery endpoints:

- `webhook_id`

### Format

Use cryptographically random URL-safe identifiers, for example 24-32 character base32 or base62 strings. They should not encode creation order.

### Internal vs external IDs

Keep internal integer primary keys in SQLite for joins and low-risk migration. Add unique opaque IDs for public use. This avoids a disruptive full-primary-key rewrite while still eliminating enumerable IDs from the product surface.

API JSON, route params, form values, copied webhook URLs, and environment switcher values must all use opaque IDs only.

## Database Changes

### New table

`environments`

- `id INTEGER PRIMARY KEY`
- `public_id TEXT NOT NULL UNIQUE`
- `name TEXT NOT NULL UNIQUE`
- `slug TEXT NOT NULL UNIQUE`
- `description TEXT NOT NULL DEFAULT ''`
- `color TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### New table

`repository_sources`

- `id INTEGER PRIMARY KEY`
- `public_id TEXT NOT NULL UNIQUE`
- `name TEXT NOT NULL UNIQUE`
- `provider TEXT NOT NULL`
- `repo_url TEXT NOT NULL`
- `deploy_key_cipher TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### New table

`environment_repositories`

- `id INTEGER PRIMARY KEY`
- `public_id TEXT NOT NULL UNIQUE`
- `environment_id INTEGER NOT NULL REFERENCES environments(id)`
- `repository_source_id INTEGER NOT NULL REFERENCES repository_sources(id)`
- `branch TEXT NOT NULL`
- `work_dir TEXT NOT NULL`
- `deploy_script TEXT NOT NULL`
- `runner_id INTEGER NULL REFERENCES runners(id)`
- `clean_worktree INTEGER NOT NULL`
- `webhook_secret_cipher TEXT NOT NULL`
- `webhook_id TEXT NOT NULL UNIQUE`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### Existing tables

Add to `runners`, `secrets`, `deploy_jobs`:

- `public_id TEXT NOT NULL UNIQUE`
- `environment_id INTEGER NOT NULL REFERENCES environments(id)`

Update `deploy_jobs` so the repository relation points to `environment_repositories`, not the global repository source.

Update repository-scoped secrets so the optional repository relation points to `environment_repositories`, not the global repository source.

### Uniqueness rules

Repository sources:

- `UNIQUE(name)`

Environment repository bindings:

- `UNIQUE(environment_id, repository_source_id)`

Runners:

- `UNIQUE(environment_id, name)`

Secrets:

- Environment-global secret:
  `UNIQUE(environment_id, name)` when `environment_repository_id IS NULL`
- Environment-repository-scoped secret:
  `UNIQUE(environment_id, environment_repository_id, name)`

Deploy jobs:

- Continue existing per-repository delivery dedupe logic, but the repository is now the environment repository binding.

### Cross-environment consistency rules

Application-level validation must reject:

- assigning a Runner from another environment to an environment repository binding
- binding an environment-repository-scoped Secret to a binding from another environment
- querying or mutating an environment-owned resource through an environment context it does not belong to
- manually triggering a deployment for an environment repository outside the selected environment

## Migration Strategy

### Upgrade path

For existing databases:

1. Create `environments`.
2. Insert one default environment named `Production`.
3. Create `repository_sources`.
4. Create `environment_repositories`.
5. Migrate each existing repository row into one `repository_sources` row carrying `name`, `provider`, `repo_url`, and `deploy_key_cipher`.
6. For each migrated repository, create one `environment_repositories` row in the default environment carrying `branch`, `work_dir`, `deploy_script`, `runner_id`, `clean_worktree`, `webhook_secret_cipher`, and a generated `webhook_id`.
7. Add `public_id` and `environment_id` to existing `runners`, `secrets`, and `deploy_jobs`.
8. Backfill all existing Runners, Secrets, and deploy jobs into the default environment.
9. Update deploy jobs to point to the new environment repository binding.
10. Update repository-scoped secrets to point to the new environment repository binding.
11. Generate opaque `public_id` values for all existing rows.
12. Rebuild indexes and uniqueness constraints around the new split model.

### Safety rules

- Migration must be idempotent.
- The upgraded system must always have at least one environment.
- Deleting the last environment is forbidden.
- Deleting a non-empty environment is forbidden in the first version.
- Deleting a repository source is forbidden while it is still connected to any environment.

## API Design

### Environments

Add:

- `GET /api/environments`
- `POST /api/environments`
- `PUT /api/environments/{environmentId}`
- `DELETE /api/environments/{environmentId}`

Request and response IDs use `public_id`.

### Repository sources

Add:

- `GET /api/repository-sources`
- `POST /api/repository-sources`
- `PUT /api/repository-sources/{repositorySourceId}`
- `DELETE /api/repository-sources/{repositorySourceId}`

These APIs manage the reusable Git source definition and deployment key.

### Environment-scoped list APIs

Keep current top-level resources, but require explicit environment scoping for reads:

- `GET /api/repositories?environmentId={environmentPublicId}`
- `GET /api/runners?environmentId={environmentPublicId}`
- `GET /api/secrets?environmentId={environmentPublicId}`
- `GET /api/jobs?environmentId={environmentPublicId}`

For repositories, the environment-scoped list returns environment repository bindings joined with their repository source metadata.

### Environment repository binding APIs

Add or reinterpret:

- `POST /api/repositories`
- `PUT /api/repositories/{environmentRepositoryId}`
- `DELETE /api/repositories/{environmentRepositoryId}`
- `POST /api/repositories/{environmentRepositoryId}/trigger`

Here `repositoryId` refers to the environment repository binding `public_id`, not the global repository source.

Creates and updates must include `environmentId`. They either reference an existing repository source or create one first in a guided UI flow.

### Other entity APIs

Entity routes use opaque public IDs:

- `PUT /api/runners/{runnerId}`
- `DELETE /api/runners/{runnerId}`
- `POST /api/runners/{runnerId}/test`
- `PUT /api/secrets/{secretId}`
- `DELETE /api/secrets/{secretId}`
- `GET /api/jobs/{jobId}`
- `GET /api/jobs/{jobId}/logs`

The backend resolves these to internal IDs and validates environment ownership before proceeding.

## Webhook Design

### Decision

Stop using repository integer IDs in webhook URLs.

Each environment repository binding gets a unique opaque `webhook_id`, and the webhook route becomes:

- `/webhooks/{webhookId}`

### Why this design

- No enumerable repository identity in the public webhook surface.
- No need to force GitHub or Gitee users to understand environment slugs.
- Environment still flows correctly because the webhook resolves to one environment repository binding, which belongs to one environment and one repository source.

### Behavior

On webhook receipt:

1. Resolve environment repository binding by `webhook_id`.
2. Load the binding, its repository source, and its environment.
3. Verify webhook signature.
4. Check branch filter.
5. Enqueue deployment in that same environment context.
6. Resolve environment-scoped Runner and Secrets only from that environment.

## Secret Resolution

Secrets remain two-tiered, but only within the current environment:

- environment-global secret
- environment-repository-scoped secret

Resolution order during deployment:

1. Start with environment-global secrets.
2. Apply environment-repository-scoped secrets for the same environment.
3. Environment-repository-scoped names override environment-global names.

No secret may be read across environments.

## Frontend Design

### Environment switcher

Add an environment switcher in the top bar near the existing global controls.

Behavior:

- Show current environment name and color badge.
- Persist the selected environment in `localStorage`.
- On first load, auto-select the first environment returned by the API.
- Switching environments reloads overview, repositories, Runners, Secrets, and logs for that environment.

### Environment management

Add a management entry from the switcher:

- create environment
- edit environment name, slug, description, color
- delete environment only when empty

### Dashboard behavior

Overview, Repos, Runners, Secrets, and Logs all operate in the current environment context. Forms inherit the selected environment automatically.

The repository experience changes shape slightly:

- repository source management stores Git URL and deployment key once
- in an environment, the Repos list shows environment repository bindings
- adding a repo inside an environment first selects or creates a repository source, then configures branch, Runner, work directory, webhook secret, and deploy script for that environment

This keeps deployment keys reusable while preserving environment-specific deployment behavior.

### Environment visual framing

Each environment has a contextual color used for lightweight framing:

- page edge glow or inset border
- top accent line
- environment badge
- destructive action emphasis

The existing Candy product palette remains the brand theme. Environment color is only a context signal that makes it obvious whether the user is operating in `Production`, `Staging`, or `Test`.

## Validation and Error Handling

- Creating an environment with duplicate `name` or `slug` returns a validation error.
- Invalid hex colors return a validation error.
- Assigning a Runner from another environment to an environment repository binding returns a validation error.
- Binding an environment-repository-scoped Secret to a binding from another environment returns a validation error.
- Deleting a non-empty environment returns a validation error with a summary of blocking resource counts.
- Deleting a repository source that is still bound to an environment returns a validation error.
- Missing or unknown `environmentId` in list APIs returns a validation error.
- Accessing a resource by `public_id` that does not exist returns `404`.

## Testing Strategy

### Backend

Add migration tests that verify:

- default environment creation on upgrade
- repository split from old flat repositories into repository sources and environment repository bindings
- opaque ID backfill for existing rows
- webhook ID backfill for environment repository bindings
- environment-scoped uniqueness rules

Add store and API tests that verify:

- one repository source can be attached to multiple environments
- environment repository bindings can use different branches for the same repository source
- cross-environment Runner assignment is rejected
- cross-environment Secret assignment is rejected
- deployment secret resolution stays within one environment
- webhook resolution uses binding-level `webhook_id`
- entity lookup uses opaque IDs, not integer IDs

### Frontend

Add UI tests when the project adopts a frontend test runner. Until then, verify with build plus manual smoke checks:

- switching environment refreshes all tabs
- one repository source can appear in multiple environments with different branch labels
- environment color changes the page framing
- environment selection persists across reload
- environment deletion is blocked when not empty

## Rollout Plan

1. Add environment table, repository split, opaque IDs, and migration support.
2. Update store and API layers for environment-aware reads and writes.
3. Convert webhook lookup to environment repository `webhook_id`.
4. Add environment switcher, environment management UI, and repository source plus environment binding flows.
5. Add environment color framing and destructive-action cues.
6. Update README and operational docs.

## Open Choices Already Resolved

- Environment is a first-class namespace: yes
- Repository source is global, while deployment binding, Runners, Secrets, and jobs are environment-scoped: yes
- Different environments can deploy different branches from the same repository source: yes
- Frontend uses a top-level environment switcher, not a tab: yes
- Different environments have different visual framing colors: yes
- Integer IDs are not exposed externally: yes
- Webhook URL uses an opaque binding-level `webhook_id`: yes

