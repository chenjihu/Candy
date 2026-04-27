# Hard-Cut Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all legacy repository-bridge and old webhook compatibility code so Candy only supports the current environment-based model on fresh databases.

**Architecture:** The backend stops translating through the old `repositories` runtime shape and instead treats `environment_repositories` as the deployment root everywhere: secrets, jobs, webhooks, and deploy execution. Startup initializes only the current schema, with no schema-repair or legacy upgrade path. The frontend keeps the same user experience but consumes only the final opaque-ID contract.

**Tech Stack:** Go, SQLite (`modernc.org/sqlite`), React 19, Vite

---

## File Structure

**Modify:**

- `backend/internal/candy/types.go`
  Remove compatibility-only fields and define final runtime-facing shapes for secrets, environment repositories, and jobs.
- `backend/internal/candy/store.go`
  Replace legacy-aware schema/migration logic with fresh-schema initialization and final-model queries.
- `backend/internal/candy/api.go`
  Remove bridge lookups through legacy repository IDs and operate directly on `environment_repositories`.
- `backend/internal/candy/webhook.go`
  Resolve webhooks and create jobs directly from `environment_repositories`, keeping only standard signature verification.
- `backend/internal/candy/deployer.go`
  Load deploy inputs directly from `environment_repositories` plus `repository_sources`.
- `backend/internal/candy/secrets_store_test.go`
  Update secret tests to use final environment-repository relations.
- `backend/internal/candy/environment_store_test.go`
  Replace legacy bridge assertions with direct final-model assertions.
- `backend/internal/candy/environment_api_test.go`
  Add direct API coverage for final delete and scope behavior.
- `backend/internal/candy/store_migration_test.go`
  Delete legacy-upgrade tests and replace them with fresh-schema initialization tests only.
- `backend/internal/candy/webhook_test.go`
  Remove tests for deprecated compatibility verification paths and keep final signature behavior.
- `README.md`
  Remove legacy upgrade/compatibility wording.
- `README.zh.md`
  Remove legacy upgrade/compatibility wording.

**Delete or heavily rewrite:**

- Old migration-repair helpers inside `backend/internal/candy/store.go`
- Any tests whose only purpose is validating old flat-repository upgrade paths

---

### Task 1: Lock the final schema in tests

**Files:**
- Modify: `backend/internal/candy/store_migration_test.go`
- Test: `backend/internal/candy/store_migration_test.go`

- [ ] **Step 1: Replace legacy migration tests with a fresh-schema initialization test**

Add a focused test like this to `backend/internal/candy/store_migration_test.go`:

```go
func TestNewStoreInitializesCurrentSchemaOnly(t *testing.T) {
	ctx := context.Background()
	cfg := Config{
		DBPath:        filepath.Join(t.TempDir(), "candy.db"),
		PublicURL:     "https://deploy.example.com",
		AdminUsername: "super_admin",
		AdminPassword: "strong-password",
	}

	store, err := NewStore(ctx, cfg, NewSecretBox("test-secret"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	defer store.Close()

	mustHaveTable := func(name string) {
		t.Helper()
		var count int
		err := store.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`,
			name,
		).Scan(&count)
		if err != nil {
			t.Fatalf("table lookup for %s error = %v", name, err)
		}
		if count != 1 {
			t.Fatalf("table %s count = %d, want 1", name, count)
		}
	}

	mustHaveTable("environments")
	mustHaveTable("repository_sources")
	mustHaveTable("environment_repositories")
	mustHaveTable("secrets")
	mustHaveTable("deploy_jobs")
}
```

- [ ] **Step 2: Add a schema-shape assertion that legacy bridge columns no longer exist**

In the same test file, add:

```go
func TestCurrentSchemaDoesNotExposeLegacyRepositoryBridge(t *testing.T) {
	ctx := context.Background()
	cfg := Config{
		DBPath:        filepath.Join(t.TempDir(), "candy.db"),
		PublicURL:     "https://deploy.example.com",
		AdminUsername: "super_admin",
		AdminPassword: "strong-password",
	}

	store, err := NewStore(ctx, cfg, NewSecretBox("test-secret"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}
	defer store.Close()

	rows, err := store.db.QueryContext(ctx, `PRAGMA table_info(environment_repositories)`)
	if err != nil {
		t.Fatalf("PRAGMA table_info error = %v", err)
	}
	defer rows.Close()

	columns := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull, pk int
		var dflt any
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			t.Fatalf("Scan() error = %v", err)
		}
		columns[name] = true
	}

	if columns["legacy_repository_id"] {
		t.Fatal("environment_repositories unexpectedly contains legacy_repository_id")
	}
}
```

- [ ] **Step 3: Run the targeted tests to verify they fail**

Run:

```bash
env GOCACHE=/tmp/candy-go-build go test ./internal/candy -run 'TestNewStoreInitializesCurrentSchemaOnly|TestCurrentSchemaDoesNotExposeLegacyRepositoryBridge'
```

Expected: FAIL because the current schema and migration helpers still expose legacy bridge behavior.

- [ ] **Step 4: Remove legacy migration-only tests from the file**

Delete tests that specifically verify:

- flat repository upgrade into split tables
- `legacy_repository_id` repair
- blank `webhook_id` repair
- split-schema drift rebuild

Keep only fresh-install schema tests and direct current-model invariants.

- [ ] **Step 5: Re-run the targeted tests after the schema cleanup lands**

Run:

```bash
env GOCACHE=/tmp/candy-go-build go test ./internal/candy -run 'TestNewStoreInitializesCurrentSchemaOnly|TestCurrentSchemaDoesNotExposeLegacyRepositoryBridge'
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/internal/candy/store_migration_test.go
git commit -m "test: lock fresh-only schema expectations"
```

### Task 2: Rewrite the store schema around the final model

**Files:**
- Modify: `backend/internal/candy/store.go`
- Modify: `backend/internal/candy/types.go`
- Test: `backend/internal/candy/store_migration_test.go`

- [ ] **Step 1: Remove legacy bridge fields from the runtime types**

Update `backend/internal/candy/types.go` so compatibility-only fields are gone from runtime structs. The target shape should look like:

```go
type Secret struct {
	ID                  int64     `json:"id"`
	Name                string    `json:"name"`
	Value               string    `json:"value,omitempty"`
	MaskedValue         string    `json:"maskedValue,omitempty"`
	EnvironmentRepoID   *int64    `json:"-"`
	RepositoryKey       string    `json:"repositoryId,omitempty"`
	Repository          string    `json:"repository,omitempty"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

type DeployJob struct {
	ID                    int64      `json:"id"`
	EnvironmentRepoID     int64      `json:"-"`
	RepositoryKey         string     `json:"repositoryId"`
	RepositoryName        string     `json:"repositoryName,omitempty"`
	RunnerID              *int64     `json:"runnerId,omitempty"`
	RunnerName            string     `json:"runnerName,omitempty"`
	Provider              string     `json:"provider"`
	Event                 string     `json:"event"`
	DeliveryID            string     `json:"deliveryId"`
	Branch                string     `json:"branch"`
	CommitSHA             string     `json:"commitSha"`
	CommitMessage         string     `json:"commitMessage"`
	CommitAuthor          string     `json:"commitAuthor"`
	Status                string     `json:"status"`
	ExitCode              *int       `json:"exitCode,omitempty"`
	Error                 string     `json:"error,omitempty"`
	TriggeredAt           time.Time  `json:"triggeredAt"`
	StartedAt             *time.Time `json:"startedAt,omitempty"`
	FinishedAt            *time.Time `json:"finishedAt,omitempty"`
}
```

- [ ] **Step 2: Replace the schema DDL with the final direct relations**

In `backend/internal/candy/store.go`, make the canonical DDL define:

```sql
CREATE TABLE IF NOT EXISTS environment_repositories (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	public_id TEXT NOT NULL UNIQUE,
	environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
	repository_source_id INTEGER NOT NULL REFERENCES repository_sources(id) ON DELETE CASCADE,
	webhook_secret_cipher TEXT NOT NULL,
	webhook_id TEXT NOT NULL UNIQUE CHECK (webhook_id <> ''),
	branch TEXT NOT NULL,
	work_dir TEXT NOT NULL,
	deploy_script TEXT NOT NULL,
	runner_id INTEGER NULL REFERENCES runners(id) ON DELETE SET NULL,
	clean_worktree INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE(environment_id, repository_source_id)
);

CREATE TABLE IF NOT EXISTS secrets (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	value_cipher TEXT NOT NULL,
	environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
	environment_repository_id INTEGER NULL REFERENCES environment_repositories(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE(environment_id, environment_repository_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS secrets_environment_global_name_idx
	ON secrets(environment_id, name)
	WHERE environment_repository_id IS NULL;

CREATE TABLE IF NOT EXISTS deploy_jobs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	environment_repository_id INTEGER NOT NULL REFERENCES environment_repositories(id) ON DELETE CASCADE,
	runner_id INTEGER NULL REFERENCES runners(id) ON DELETE SET NULL,
	provider TEXT NOT NULL,
	event TEXT NOT NULL,
	delivery_id TEXT NOT NULL DEFAULT '',
	branch TEXT NOT NULL,
	commit_sha TEXT NOT NULL,
	commit_message TEXT NOT NULL DEFAULT '',
	commit_author TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'queued',
	exit_code INTEGER NULL,
	error TEXT NOT NULL DEFAULT '',
	triggered_at TEXT NOT NULL,
	started_at TEXT NULL,
	finished_at TEXT NULL
);
```

- [ ] **Step 3: Delete legacy migration helpers**

Remove store code paths that only exist for old-version upgrades, including helpers like:

- `migrateRepositorySourcesUniqueName`
- `migrateEnvironmentRepositoriesSplitSchema`
- `recoverLegacyRepositoryID`
- schema drift detectors for missing `legacy_repository_id`
- schema drift detectors for missing or blank `webhook_id`

The `migrate` or initialization path should now only:

```go
func (s *Store) migrate(ctx context.Context) error {
	for _, stmt := range schemaStatements {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	if err := s.ensureDefaultEnvironments(ctx); err != nil {
		return err
	}
	return nil
}
```

- [ ] **Step 4: Run the targeted schema tests**

Run:

```bash
env GOCACHE=/tmp/candy-go-build go test ./internal/candy -run 'TestNewStoreInitializesCurrentSchemaOnly|TestCurrentSchemaDoesNotExposeLegacyRepositoryBridge'
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/candy/types.go backend/internal/candy/store.go backend/internal/candy/store_migration_test.go
git commit -m "refactor: hard-cut store schema to final model"
```

### Task 3: Convert secret storage to direct environment-repository scope

**Files:**
- Modify: `backend/internal/candy/store.go`
- Modify: `backend/internal/candy/api.go`
- Modify: `backend/internal/candy/secrets_store_test.go`
- Modify: `backend/internal/candy/environment_store_test.go`

- [ ] **Step 1: Write the failing secret-scope tests against the direct model**

Update `backend/internal/candy/secrets_store_test.go` and `backend/internal/candy/environment_store_test.go` so repo-scoped secrets are created with `environment_repository_id`, not through legacy repository lookups:

```go
func TestDeploymentSecretsRepositoryOverridesEnvironmentGlobal(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)

	env, err := mustEnvironmentBySlug(ctx, store, "production")
	if err != nil {
		t.Fatalf("mustEnvironmentBySlug(production) error = %v", err)
	}
	source, err := store.CreateRepositorySource(ctx, RepositorySource{
		Name:      "app",
		Provider:  "github",
		RepoURL:   "git@example.com:org/app.git",
		DeployKey: "deploy-key",
	})
	if err != nil {
		t.Fatalf("CreateRepositorySource() error = %v", err)
	}
	repo, err := store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentKey: env.PublicID,
		SourceKey:      source.PublicID,
		Branch:         "main",
		WorkDir:        "/srv/app",
		DeployScript:   "echo ok",
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository() error = %v", err)
	}

	record, err := store.getEnvironmentRepositoryRecordByPublicID(ctx, repo.PublicID, false)
	if err != nil {
		t.Fatalf("getEnvironmentRepositoryRecordByPublicID() error = %v", err)
	}

	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "global", EnvironmentID: env.ID}); err != nil {
		t.Fatalf("CreateSecret(global) error = %v", err)
	}
	repoID := record.ID
	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "repo", EnvironmentID: env.ID, EnvironmentRepoID: &repoID}); err != nil {
		t.Fatalf("CreateSecret(repo) error = %v", err)
	}

	secrets, err := store.DeploymentSecrets(ctx, repo.PublicID)
	if err != nil {
		t.Fatalf("DeploymentSecrets() error = %v", err)
	}
	if len(secrets) != 1 || secrets[0].Value != "repo" {
		t.Fatalf("DeploymentSecrets() = %#v, want repo override", secrets)
	}
}
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
env GOCACHE=/tmp/candy-go-build go test ./internal/candy -run 'TestDeploymentSecretsRepositoryOverridesEnvironmentGlobal|TestDeploymentSecretsStayWithinEnvironmentRepository'
```

Expected: FAIL because secrets still rely on the old repository bridge.

- [ ] **Step 3: Update the secret store methods**

In `backend/internal/candy/store.go`, rewrite `CreateSecret`, `UpdateSecret`, `GetSecret`, `ListSecrets`, and `DeploymentSecrets` around `environment_id` and `environment_repository_id`. The direct lookup query should look like:

```go
rows, err := s.db.QueryContext(ctx,
	`SELECT s.id, s.name, s.value_cipher, s.environment_repository_id,
	        COALESCE(er.public_id, ''), COALESCE(src.name, ''), s.created_at, s.updated_at
	 FROM secrets s
	 LEFT JOIN environment_repositories er ON er.id = s.environment_repository_id
	 LEFT JOIN repository_sources src ON src.id = er.repository_source_id
	 WHERE s.environment_id = ?
	   AND (s.environment_repository_id IS NULL OR s.environment_repository_id = ?)
	 ORDER BY s.environment_repository_id IS NOT NULL`,
	repository.EnvironmentID,
	repository.ID,
)
```

- [ ] **Step 4: Update secret API scope resolution**

In `backend/internal/candy/api.go`, make `resolveSecretRepositoryScope` populate final-model fields:

```go
func (a *App) resolveSecretRepositoryScope(ctx context.Context, environmentPublicID string, secret *Secret) error {
	env, err := a.store.getEnvironmentByPublicID(ctx, environmentPublicID)
	if err != nil {
		return err
	}
	secret.EnvironmentID = env.ID
	secret.EnvironmentRepoID = nil
	secret.RepositoryKey = strings.TrimSpace(secret.RepositoryKey)
	if secret.RepositoryKey == "" {
		return nil
	}

	repository, err := a.store.getEnvironmentRepositoryRecordByPublicID(ctx, secret.RepositoryKey, false)
	if err != nil {
		return err
	}
	if repository.EnvironmentKey != environmentPublicID {
		return errors.New("repository is not in the selected environment")
	}
	repositoryID := repository.ID
	secret.EnvironmentRepoID = &repositoryID
	return nil
}
```

- [ ] **Step 5: Re-run the targeted tests**

Run:

```bash
env GOCACHE=/tmp/candy-go-build go test ./internal/candy -run 'TestDeploymentSecretsRepositoryOverridesEnvironmentGlobal|TestDeploymentSecretsStayWithinEnvironmentRepository'
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/internal/candy/store.go backend/internal/candy/api.go backend/internal/candy/secrets_store_test.go backend/internal/candy/environment_store_test.go
git commit -m "refactor: scope secrets directly to environment bindings"
```

### Task 4: Convert jobs, webhook ingestion, and deploy execution

**Files:**
- Modify: `backend/internal/candy/store.go`
- Modify: `backend/internal/candy/api.go`
- Modify: `backend/internal/candy/webhook.go`
- Modify: `backend/internal/candy/deployer.go`
- Modify: `backend/internal/candy/environment_api_test.go`
- Modify: `backend/internal/candy/webhook_test.go`

- [ ] **Step 1: Write the failing direct-webhook and delete tests**

Add or update tests like:

```go
func TestWebhookResolvesByWebhookIDWithoutLegacyBridge(t *testing.T) {
	app := newTestApp(t)
	ctx := t.Context()

	env, err := mustEnvironmentBySlug(ctx, app.store, "production")
	if err != nil {
		t.Fatalf("mustEnvironmentBySlug(production) error = %v", err)
	}
	source, err := app.store.CreateRepositorySource(ctx, RepositorySource{
		Name:      "frontend",
		Provider:  "github",
		RepoURL:   "git@example.com:org/frontend.git",
		DeployKey: "key",
	})
	if err != nil {
		t.Fatalf("CreateRepositorySource() error = %v", err)
	}
	repo, err := app.store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentKey: env.PublicID,
		SourceKey:      source.PublicID,
		Branch:         "main",
		WorkDir:        "/srv/frontend",
		DeployScript:   "echo ok",
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository() error = %v", err)
	}
	if repo.WebhookURL == "" {
		t.Fatal("WebhookURL = empty, want generated")
	}
}
```

Also keep direct delete tests for orphan source cleanup, but make them verify no legacy bridge assumptions remain.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
env GOCACHE=/tmp/candy-go-build go test ./internal/candy -run 'TestWebhookResolvesByWebhookIDWithoutLegacyBridge|TestDeleteRepositoryRemovesOrphanRepositorySource|TestDeleteRepositoryKeepsSharedRepositorySource'
```

Expected: FAIL because jobs, webhooks, and delete cleanup still depend on old repository relations.

- [ ] **Step 3: Change deploy job storage to point to environment repositories directly**

In `backend/internal/candy/store.go`, update the job insert and select pipeline:

```go
result, err := s.db.ExecContext(ctx,
	`INSERT INTO deploy_jobs
	 (environment_repository_id, runner_id, provider, event, delivery_id, branch, commit_sha, commit_message, commit_author,
	  status, exit_code, error, triggered_at, started_at, finished_at)
	 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	job.EnvironmentRepoID, nullableInt64(job.RunnerID), job.Provider, job.Event, job.DeliveryID, job.Branch,
	job.CommitSHA, job.CommitMessage, job.CommitAuthor, job.Status, nullableInt(job.ExitCode), job.Error,
	dbTime(job.TriggeredAt), nullableTime(job.StartedAt), nullableTime(job.FinishedAt),
)
```

Make `jobSelectSQL()` join through `environment_repositories` and `repository_sources`, not the old `repositories` table.

- [ ] **Step 4: Update webhook ingestion and deployer lookups**

In `backend/internal/candy/webhook.go`, remove `LegacyRepositoryID` checks and create jobs directly from the environment repository record:

```go
job := DeployJob{
	EnvironmentRepoID: repo.ID,
	RepositoryKey:     repo.PublicID,
	RepositoryName:    repo.Name,
	RunnerID:          repo.RunnerID,
	RunnerName:        repo.Runner,
	Provider:          provider,
	Event:             event,
	DeliveryID:        deliveryID,
	Branch:            branch,
	CommitSHA:         commitSHA,
	CommitMessage:     commitMessage,
	CommitAuthor:      commitAuthor,
	Status:            "queued",
	TriggeredAt:       time.Now(),
}
```

In `backend/internal/candy/deployer.go`, replace legacy repository record lookup with:

```go
environmentRepository, err := d.app.store.getEnvironmentRepositoryRecordByID(ctx, job.EnvironmentRepoID, true)
```

and use `environmentRepository.RepositorySourceID` to load repo URL and deploy key.

- [ ] **Step 5: Remove deprecated Gitee compatibility verification**

In `backend/internal/candy/webhook.go`, keep only the standard Gitee HMAC/timestamp path. The old equality fallback should be removed so the flow is simply:

```go
func verifyGiteeSignature(secret string, r *http.Request) error {
	timestamp := strings.TrimSpace(r.Header.Get("X-Gitee-Timestamp"))
	token := strings.TrimSpace(r.Header.Get("X-Gitee-Token"))
	if timestamp == "" || token == "" {
		return errors.New("missing gitee signature headers")
	}
	expected := hmacSHA256Base64(secret, timestamp+"\n"+secret)
	if subtle.ConstantTimeCompare([]byte(token), []byte(url.QueryEscape(expected))) == 1 {
		return nil
	}
	if subtle.ConstantTimeCompare([]byte(token), []byte(expected)) == 1 {
		return nil
	}
	return errors.New("invalid gitee signature")
}
```

- [ ] **Step 6: Re-run the focused tests**

Run:

```bash
env GOCACHE=/tmp/candy-go-build go test ./internal/candy -run 'TestWebhookResolvesByWebhookIDWithoutLegacyBridge|TestDeleteRepositoryRemovesOrphanRepositorySource|TestDeleteRepositoryKeepsSharedRepositorySource'
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/internal/candy/store.go backend/internal/candy/api.go backend/internal/candy/webhook.go backend/internal/candy/deployer.go backend/internal/candy/environment_api_test.go backend/internal/candy/webhook_test.go
git commit -m "refactor: route jobs and webhooks through environment bindings"
```

### Task 5: Remove frontend references to bridge-era fields and update docs

**Files:**
- Modify: `frontend/src/main.jsx`
- Modify: `README.md`
- Modify: `README.zh.md`

- [ ] **Step 1: Search for bridge-era field assumptions**

Verify the frontend only uses opaque IDs and final-model fields:

```bash
rg -n "legacyRepository|repository_id|old webhook|token 等值|compat" frontend/src/main.jsx README.md README.zh.md
```

Expected before cleanup: matches in docs and possibly comments or stale logic.

- [ ] **Step 2: Remove stale frontend assumptions**

Keep the final shape for secret scope and repository binding flows. The target payloads should continue to look like:

```js
const payload = {
  name: secretForm.name.trim().toUpperCase(),
  value: secretForm.value,
  repositoryId: secretForm.repositoryId || null
};
```

and:

```js
const payload = {
  environmentId: selectedEnvironment.id,
  repositorySourceId,
  webhookSecret: form.webhookSecret,
  branch: form.branch,
  workDir: form.workDir,
  deployScript: form.deployScript,
  runnerId: form.runnerId || '',
  cleanWorktree: form.cleanWorktree
};
```

No fallback logic should mention numeric repository IDs or old webhook behavior.

- [ ] **Step 3: Remove legacy-compatibility wording from docs**

Update `README.md` and `README.zh.md` so they clearly say:

```md
- Candy supports the current environment-based schema only.
- Existing legacy databases are not supported for in-place automatic upgrade.
- Webhook verification supports standard GitHub and Gitee signatures only.
```

Remove wording like:

- “compatible with old token equality verification”
- “upgrade old repositories automatically”
- any explanation centered on the old flat repository table

- [ ] **Step 4: Run the frontend build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/main.jsx README.md README.zh.md
git commit -m "docs: remove legacy compatibility language"
```

### Task 6: Final verification sweep

**Files:**
- Modify as needed: any of the files above
- Test: full project verification

- [ ] **Step 1: Prove the bridge is gone**

Run:

```bash
rg -n "LegacyRepositoryID|legacy_repository_id|recoverLegacyRepositoryID|old token|token 等值|schema repair|split schema" backend/internal/candy README.md README.zh.md
```

Expected: no matches outside deleted-test history or the new hard-cut spec/plan docs.

- [ ] **Step 2: Run the backend test suite**

Run:

```bash
env GOCACHE=/tmp/candy-go-build go test ./internal/candy
```

Expected: PASS

- [ ] **Step 3: Run the frontend build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 4: Fix any remaining compile or test regressions**

If either verification command fails, make the smallest possible fix in the touched files only, then re-run both commands until they pass.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/candy frontend/src/main.jsx README.md README.zh.md
git commit -m "refactor: remove legacy repository compatibility"
```
