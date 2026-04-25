# Environment Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class environments with strict environment-scoped deployment bindings, reusable repository sources, opaque public IDs, and binding-level webhook IDs across the backend and frontend.

**Architecture:** The backend keeps internal integer primary keys for SQLite joins, but adds opaque `public_id` values for all externally visible resources plus `webhook_id` for environment repository bindings. The current flat `repositories` table is split into a global `repository_sources` table and an environment-owned `environment_repositories` table, while Runners, Secrets, and deploy jobs remain environment-owned. The frontend adds an environment switcher, environment management, environment color framing, and a repository flow that first selects or creates a reusable source, then configures environment-specific deployment settings.

**Tech Stack:** Go, SQLite via `modernc.org/sqlite`, React 19, Vite

---

## File Structure

**Create:**

- `backend/internal/candy/id.go`
  Opaque public ID and webhook ID generation helpers.
- `backend/internal/candy/environment_store_test.go`
  Store-level tests for environment creation, repository split behavior, and cross-environment validation.
- `backend/internal/candy/environment_api_test.go`
  API tests for environment CRUD and environment-scoped resource access.
- `docs/superpowers/specs/2026-04-24-environment-isolation-design.md`
  Already written design reference for implementers.

**Modify:**

- `backend/internal/candy/types.go`
  Add `Environment`, `RepositorySource`, `EnvironmentRepository`, and update `Secret` / `DeployJob` identifiers and relations.
- `backend/internal/candy/store.go`
  Add schema migration, repository split, public ID lookup, environment CRUD, environment-aware queries, and webhook binding lookup.
- `backend/internal/candy/api.go`
  Add environment and repository source handlers, update repository/runner/secret/job handlers to use `public_id` and `environmentId`.
- `backend/internal/candy/app.go`
  Register the new environment and repository source routes.
- `backend/internal/candy/webhook.go`
  Resolve webhook requests by `webhook_id`.
- `backend/internal/candy/deployer.go`
  Deploy from environment repository bindings joined with repository sources; keep secret injection environment-safe.
- `backend/internal/candy/store_migration_test.go`
  Add migration coverage for repository split, environment defaulting, and opaque ID backfill.
- `backend/internal/candy/secrets_store_test.go`
  Update secret tests to use environment repository bindings.
- `backend/internal/candy/webhook_test.go`
  Add webhook binding lookup tests.
- `frontend/src/main.jsx`
  Add environment state, switcher UI, environment CRUD, repository source plus environment binding flows, and opaque ID usage.
- `frontend/src/styles.css`
  Add environment framing styles and environment switcher styling.
- `README.md`
  Document environments, repository source reuse, and new webhook format.
- `README.zh.md`
  Same in Chinese.

---

### Task 1: Backend ID primitives and core types

**Files:**

- Create: `backend/internal/candy/id.go`
- Modify: `backend/internal/candy/types.go`
- Test: `backend/internal/candy/environment_store_test.go`

- [ ] **Step 1: Write the failing backend ID test**

Add this test skeleton to `backend/internal/candy/environment_store_test.go`:

```go
package candy

import "testing"

func TestNewPublicIDProducesOpaqueURLSafeValue(t *testing.T) {
	id1, err := newPublicID("env")
	if err != nil {
		t.Fatalf("newPublicID() error = %v", err)
	}
	id2, err := newPublicID("env")
	if err != nil {
		t.Fatalf("newPublicID() error = %v", err)
	}
	if id1 == id2 {
		t.Fatal("newPublicID() returned duplicate values")
	}
	if len(id1) < 16 {
		t.Fatalf("newPublicID() length = %d, want >= 16", len(id1))
	}
	for _, ch := range id1 {
		if !(ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'z') {
			t.Fatalf("newPublicID() rune %q is not lowercase base36", ch)
		}
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env GOCACHE=/Users/ezmo/Projects/Private/candy/.cache/go-build GOMODCACHE=/Users/ezmo/Projects/Private/candy/.cache/gomod go test ./internal/candy -run TestNewPublicIDProducesOpaqueURLSafeValue`

Expected: FAIL with `undefined: newPublicID`

- [ ] **Step 3: Write the minimal ID helper**

Create `backend/internal/candy/id.go` with:

```go
package candy

import (
	"crypto/rand"
	"math/big"
)

const publicIDAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz"

func newPublicID(prefix string) (string, error) {
	const size = 24
	buf := make([]byte, size)
	limit := big.NewInt(int64(len(publicIDAlphabet)))
	for i := range buf {
		n, err := rand.Int(rand.Reader, limit)
		if err != nil {
			return "", err
		}
		buf[i] = publicIDAlphabet[n.Int64()]
	}
	if prefix == "" {
		return string(buf), nil
	}
	return prefix + "_" + string(buf), nil
}
```

- [ ] **Step 4: Add the new core types**

Update `backend/internal/candy/types.go` to introduce these types and relations:

```go
type Environment struct {
	ID          int64     `json:"-"`
	PublicID    string    `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description string    `json:"description,omitempty"`
	Color       string    `json:"color"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type RepositorySource struct {
	ID        int64     `json:"-"`
	PublicID  string    `json:"id"`
	Name      string    `json:"name"`
	Provider  string    `json:"provider"`
	RepoURL   string    `json:"repoUrl"`
	DeployKey string    `json:"deployKey,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type EnvironmentRepository struct {
	ID               int64     `json:"-"`
	PublicID         string    `json:"id"`
	EnvironmentID    int64     `json:"-"`
	EnvironmentKey   string    `json:"environmentId"`
	EnvironmentName  string    `json:"environment"`
	RepositorySourceID int64   `json:"-"`
	SourceKey        string    `json:"repositorySourceId"`
	Name             string    `json:"name"`
	Provider         string    `json:"provider"`
	RepoURL          string    `json:"repoUrl"`
	WebhookSecret    string    `json:"webhookSecret,omitempty"`
	WebhookURL       string    `json:"webhookUrl,omitempty"`
	WebhookID        string    `json:"-"`
	Branch           string    `json:"branch"`
	WorkDir          string    `json:"workDir"`
	DeployScript     string    `json:"deployScript"`
	RunnerID         *int64    `json:"-"`
	RunnerKey        string    `json:"runnerId,omitempty"`
	Runner           string    `json:"runner,omitempty"`
	CleanWorktree    bool      `json:"cleanWorktree"`
	DeployKey        string    `json:"deployKey,omitempty"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `env GOCACHE=/Users/ezmo/Projects/Private/candy/.cache/go-build GOMODCACHE=/Users/ezmo/Projects/Private/candy/.cache/gomod go test ./internal/candy -run TestNewPublicIDProducesOpaqueURLSafeValue`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/internal/candy/id.go backend/internal/candy/types.go backend/internal/candy/environment_store_test.go
git commit -m "feat: add opaque public id primitives"
```

### Task 2: Store migration and repository split

**Files:**

- Modify: `backend/internal/candy/store.go`
- Modify: `backend/internal/candy/store_migration_test.go`
- Test: `backend/internal/candy/store_migration_test.go`

- [ ] **Step 1: Write the failing migration test**

Add this test to `backend/internal/candy/store_migration_test.go`:

```go
func TestMigrateCreatesDefaultEnvironmentAndRepositorySplit(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "candy.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("sql.Open() error = %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		CREATE TABLE repositories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			provider TEXT NOT NULL,
			repo_url TEXT NOT NULL,
			webhook_secret_cipher TEXT NOT NULL,
			branch TEXT NOT NULL,
			work_dir TEXT NOT NULL,
			deploy_key_cipher TEXT NOT NULL DEFAULT '',
			deploy_script TEXT NOT NULL,
			runner_id INTEGER NULL,
			clean_worktree INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("create repositories error = %v", err)
	}

	now := dbTime(time.Now())
	if _, err := db.Exec(`
		INSERT INTO repositories
			(name, provider, repo_url, webhook_secret_cipher, branch, work_dir, deploy_key_cipher, deploy_script, clean_worktree, created_at, updated_at)
		VALUES
			('frontend', 'github', 'git@github.com:org/frontend.git', 'cipher1', 'main', '/srv/frontend', 'key1', 'echo hi', 1, ?, ?)
	`, now, now); err != nil {
		t.Fatalf("insert repository error = %v", err)
	}

	store := &Store{db: db, box: NewSecretBox("test-secret"), publicURL: "http://localhost:8080"}
	if err := store.migrate(ctx); err != nil {
		t.Fatalf("migrate() error = %v", err)
	}

	var envCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM environments`).Scan(&envCount); err != nil {
		t.Fatalf("query environments error = %v", err)
	}
	if envCount != 1 {
		t.Fatalf("environment count = %d, want 1", envCount)
	}

	var sourceCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM repository_sources`).Scan(&sourceCount); err != nil {
		t.Fatalf("query repository_sources error = %v", err)
	}
	if sourceCount != 1 {
		t.Fatalf("repository source count = %d, want 1", sourceCount)
	}

	var bindingCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM environment_repositories`).Scan(&bindingCount); err != nil {
		t.Fatalf("query environment_repositories error = %v", err)
	}
	if bindingCount != 1 {
		t.Fatalf("environment repository count = %d, want 1", bindingCount)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env GOCACHE=/Users/ezmo/Projects/Private/candy/.cache/go-build GOMODCACHE=/Users/ezmo/Projects/Private/candy/.cache/gomod go test ./internal/candy -run TestMigrateCreatesDefaultEnvironmentAndRepositorySplit`

Expected: FAIL because `environments` or `repository_sources` tables do not exist

- [ ] **Step 3: Implement the schema split and migration**

Update `backend/internal/candy/store.go` so `migrate()` creates:

```go
`CREATE TABLE IF NOT EXISTS environments (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	public_id TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL UNIQUE,
	slug TEXT NOT NULL UNIQUE,
	description TEXT NOT NULL DEFAULT '',
	color TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);`,
`CREATE TABLE IF NOT EXISTS repository_sources (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	public_id TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL UNIQUE,
	provider TEXT NOT NULL DEFAULT 'github',
	repo_url TEXT NOT NULL,
	deploy_key_cipher TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);`,
`CREATE TABLE IF NOT EXISTS environment_repositories (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	public_id TEXT NOT NULL UNIQUE,
	environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
	repository_source_id INTEGER NOT NULL REFERENCES repository_sources(id) ON DELETE CASCADE,
	webhook_secret_cipher TEXT NOT NULL,
	webhook_id TEXT NOT NULL UNIQUE,
	branch TEXT NOT NULL,
	work_dir TEXT NOT NULL,
	deploy_script TEXT NOT NULL,
	runner_id INTEGER NULL REFERENCES runners(id) ON DELETE SET NULL,
	clean_worktree INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE(environment_id, repository_source_id)
);`,
```

Also add helper methods and migration flow:

```go
func (s *Store) ensureDefaultEnvironment(ctx context.Context) (Environment, error)
func (s *Store) migrateRepositorySplit(ctx context.Context) error
```

`migrateRepositorySplit` should:

- detect legacy `repositories` table structure
- create one `repository_sources` row per legacy repository
- create one `environment_repositories` row in the default environment
- update or rebuild dependent tables after the split

- [ ] **Step 4: Run the test to verify it passes**

Run: `env GOCACHE=/Users/ezmo/Projects/Private/candy/.cache/go-build GOMODCACHE=/Users/ezmo/Projects/Private/candy/.cache/gomod go test ./internal/candy -run TestMigrateCreatesDefaultEnvironmentAndRepositorySplit`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/candy/store.go backend/internal/candy/store_migration_test.go
git commit -m "feat: split repositories into sources and environment bindings"
```

### Task 3: Store queries, webhook lookup, and deployment resolution

**Files:**

- Modify: `backend/internal/candy/store.go`
- Modify: `backend/internal/candy/deployer.go`
- Modify: `backend/internal/candy/webhook.go`
- Modify: `backend/internal/candy/secrets_store_test.go`
- Modify: `backend/internal/candy/webhook_test.go`
- Test: `backend/internal/candy/environment_store_test.go`

- [ ] **Step 1: Write the failing store behavior test**

Add this test to `backend/internal/candy/environment_store_test.go`:

```go
func TestDeploymentSecretsStayWithinEnvironmentRepository(t *testing.T) {
	ctx := context.Background()
	store, cleanup := newEnvironmentTestStore(t)
	defer cleanup()

	envA, _ := store.CreateEnvironment(ctx, Environment{Name: "Production", Slug: "production", Color: "#D83B53"})
	envB, _ := store.CreateEnvironment(ctx, Environment{Name: "Staging", Slug: "staging", Color: "#2C99F0"})
	source, _ := store.CreateRepositorySource(ctx, RepositorySource{Name: "frontend", Provider: "github", RepoURL: "git@github.com:org/frontend.git", DeployKey: "KEY"})
	repoA, _ := store.CreateEnvironmentRepository(ctx, EnvironmentRepository{EnvironmentKey: envA.PublicID, SourceKey: source.PublicID, Branch: "main", WorkDir: "/srv/prod", DeployScript: "echo prod"})
	repoB, _ := store.CreateEnvironmentRepository(ctx, EnvironmentRepository{EnvironmentKey: envB.PublicID, SourceKey: source.PublicID, Branch: "develop", WorkDir: "/srv/staging", DeployScript: "echo staging"})

	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "prod-token", EnvironmentKey: envA.PublicID, RepositoryKey: repoA.PublicID}); err != nil {
		t.Fatalf("CreateSecret(prod) error = %v", err)
	}
	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "staging-token", EnvironmentKey: envB.PublicID, RepositoryKey: repoB.PublicID}); err != nil {
		t.Fatalf("CreateSecret(staging) error = %v", err)
	}

	secrets, err := store.DeploymentSecrets(ctx, repoA.PublicID)
	if err != nil {
		t.Fatalf("DeploymentSecrets() error = %v", err)
	}
	if len(secrets) != 1 || secrets[0].Value != "prod-token" {
		t.Fatalf("DeploymentSecrets() = %#v, want only prod secret", secrets)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env GOCACHE=/Users/ezmo/Projects/Private/candy/.cache/go-build GOMODCACHE=/Users/ezmo/Projects/Private/candy/.cache/gomod go test ./internal/candy -run TestDeploymentSecretsStayWithinEnvironmentRepository`

Expected: FAIL because the store does not yet expose `CreateEnvironment`, `CreateRepositorySource`, or binding-level `DeploymentSecrets`

- [ ] **Step 3: Implement store APIs and deploy resolution**

Add store methods in `backend/internal/candy/store.go`:

```go
func (s *Store) ListEnvironments(ctx context.Context) ([]Environment, error)
func (s *Store) CreateEnvironment(ctx context.Context, env Environment) (Environment, error)
func (s *Store) UpdateEnvironment(ctx context.Context, publicID string, env Environment) (Environment, error)
func (s *Store) DeleteEnvironment(ctx context.Context, publicID string) error

func (s *Store) ListRepositorySources(ctx context.Context) ([]RepositorySource, error)
func (s *Store) CreateRepositorySource(ctx context.Context, source RepositorySource) (RepositorySource, error)
func (s *Store) UpdateRepositorySource(ctx context.Context, publicID string, source RepositorySource) (RepositorySource, error)
func (s *Store) DeleteRepositorySource(ctx context.Context, publicID string) error

func (s *Store) ListEnvironmentRepositories(ctx context.Context, environmentPublicID string) ([]EnvironmentRepository, error)
func (s *Store) CreateEnvironmentRepository(ctx context.Context, repo EnvironmentRepository) (EnvironmentRepository, error)
func (s *Store) UpdateEnvironmentRepository(ctx context.Context, publicID string, repo EnvironmentRepository) (EnvironmentRepository, error)
func (s *Store) DeleteEnvironmentRepository(ctx context.Context, publicID string) error
func (s *Store) GetEnvironmentRepositoryByWebhookID(ctx context.Context, webhookID string) (EnvironmentRepository, error)
func (s *Store) DeploymentSecrets(ctx context.Context, repositoryPublicID string) ([]Secret, error)
```

Update `backend/internal/candy/deployer.go` so deployments load:

- environment repository binding
- linked repository source
- environment-scoped Runner
- environment-scoped secrets

Update `backend/internal/candy/webhook.go` so webhook lookup starts from `webhook_id`, not repository integer ID.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `env GOCACHE=/Users/ezmo/Projects/Private/candy/.cache/go-build GOMODCACHE=/Users/ezmo/Projects/Private/candy/.cache/gomod go test ./internal/candy -run 'TestDeploymentSecretsStayWithinEnvironmentRepository|TestVerifyGitHubSignature|TestVerifyGiteeSignature'`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/candy/store.go backend/internal/candy/deployer.go backend/internal/candy/webhook.go backend/internal/candy/secrets_store_test.go backend/internal/candy/webhook_test.go backend/internal/candy/environment_store_test.go
git commit -m "feat: add environment-aware deployment resolution"
```

### Task 4: API layer and route conversion to public IDs

**Files:**

- Modify: `backend/internal/candy/api.go`
- Modify: `backend/internal/candy/app.go`
- Create: `backend/internal/candy/environment_api_test.go`
- Test: `backend/internal/candy/environment_api_test.go`

- [ ] **Step 1: Write the failing API test**

Create `backend/internal/candy/environment_api_test.go` with:

```go
package candy

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListRepositoriesRequiresEnvironmentID(t *testing.T) {
	app := newTestApp(t)
	req := httptest.NewRequest(http.MethodGet, "/api/repositories", nil)
	rec := httptest.NewRecorder()

	app.requireAuth(app.handleListRepositories)(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `env GOCACHE=/Users/ezmo/Projects/Private/candy/.cache/go-build GOMODCACHE=/Users/ezmo/Projects/Private/candy/.cache/gomod go test ./internal/candy -run TestListRepositoriesRequiresEnvironmentID`

Expected: FAIL because repositories are still listed globally

- [ ] **Step 3: Implement the environment and repository source APIs**

Update `backend/internal/candy/app.go` to register:

```go
mux.HandleFunc("GET /api/environments", a.requireAuth(a.handleListEnvironments))
mux.HandleFunc("POST /api/environments", a.requireAuth(a.handleCreateEnvironment))
mux.HandleFunc("PUT /api/environments/{id}", a.requireAuth(a.handleUpdateEnvironment))
mux.HandleFunc("DELETE /api/environments/{id}", a.requireAuth(a.handleDeleteEnvironment))

mux.HandleFunc("GET /api/repository-sources", a.requireAuth(a.handleListRepositorySources))
mux.HandleFunc("POST /api/repository-sources", a.requireAuth(a.handleCreateRepositorySource))
mux.HandleFunc("PUT /api/repository-sources/{id}", a.requireAuth(a.handleUpdateRepositorySource))
mux.HandleFunc("DELETE /api/repository-sources/{id}", a.requireAuth(a.handleDeleteRepositorySource))
```

Update `backend/internal/candy/api.go` so:

- list handlers require `environmentId` where applicable
- create/update payloads accept `environmentId`, `repositorySourceId`, and public IDs only
- repository handlers operate on `EnvironmentRepository`
- runner, secret, and job lookups resolve `public_id`

Use helper functions such as:

```go
func requiredEnvironmentID(r *http.Request) (string, error)
func pathPublicID(r *http.Request) string
```

- [ ] **Step 4: Run the focused API tests**

Run: `env GOCACHE=/Users/ezmo/Projects/Private/candy/.cache/go-build GOMODCACHE=/Users/ezmo/Projects/Private/candy/.cache/gomod go test ./internal/candy -run 'TestListRepositoriesRequiresEnvironmentID|TestValidateSecretName'`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/candy/api.go backend/internal/candy/app.go backend/internal/candy/environment_api_test.go
git commit -m "feat: add environment-aware public id api"
```

### Task 5: Frontend environment context and repository flow

**Files:**

- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/main.jsx` via build

- [ ] **Step 1: Introduce the new frontend state model**

In `frontend/src/main.jsx`, add state for:

```js
const [environments, setEnvironments] = useState([]);
const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
const [repositorySources, setRepositorySources] = useState([]);
```

Persist selected environment:

```js
const ENVIRONMENT_STORAGE_KEY = 'candy.environment';
```

Add loader logic in `refreshData`:

```js
const envs = await api('/api/environments');
const chosenId = selectedEnvironmentId || readInitialEnvironment(envs);
const [repoData, runnerData, secretData, jobData, sourceData] = await Promise.all([
  api(`/api/repositories?environmentId=${encodeURIComponent(chosenId)}`),
  api(`/api/runners?environmentId=${encodeURIComponent(chosenId)}`),
  api(`/api/secrets?environmentId=${encodeURIComponent(chosenId)}`),
  api(`/api/jobs?environmentId=${encodeURIComponent(chosenId)}`),
  api('/api/repository-sources')
]);
```

- [ ] **Step 2: Add the environment switcher UI**

In the dashboard header section of `frontend/src/main.jsx`, insert:

```jsx
<div className="environment-switcher">
  <label className="environment-label">{t('environment.current')}</label>
  <select
    value={selectedEnvironmentId}
    onChange={(event) => setSelectedEnvironmentId(event.target.value)}
  >
    {environments.map((env) => (
      <option key={env.id} value={env.id}>{env.name}</option>
    ))}
  </select>
</div>
```

Add matching strings in `I18N.en` and `I18N.zh`:

```js
environment: {
  current: 'Environment',
  manage: 'Manage environments',
  create: 'Create environment'
}
```

- [ ] **Step 3: Reshape repository forms around source plus binding**

Replace the single `emptyRepo` form with two grouped pieces:

```js
const emptyRepoSource = {
  repositorySourceId: '',
  name: '',
  provider: 'github',
  repoUrl: '',
  deployKey: ''
};

const emptyRepoBinding = {
  branch: 'main',
  workDir: '',
  webhookSecret: '',
  deployScript: 'set -e\nnpm ci\nnpm run build\n',
  runnerId: '',
  cleanWorktree: true
};
```

Create or edit flow:

- choose existing repository source, or
- enter new repository source fields
- always submit binding with the selected environment ID

The repository submit payload should look like:

```js
{
  environmentId: selectedEnvironmentId,
  repositorySourceId,
  branch: binding.branch,
  workDir: binding.workDir,
  webhookSecret: binding.webhookSecret,
  deployScript: binding.deployScript,
  runnerId: binding.runnerId || null,
  cleanWorktree: binding.cleanWorktree
}
```

- [ ] **Step 4: Add environment color framing**

In `frontend/src/main.jsx`, compute the selected environment object:

```js
const selectedEnvironment = environments.find((env) => env.id === selectedEnvironmentId) || null;
```

Apply it at the page root:

```jsx
<div
  className="dashboard-shell"
  style={selectedEnvironment ? { '--environment-accent': selectedEnvironment.color } : undefined}
>
```

Then add styles in `frontend/src/styles.css`:

```css
.dashboard-shell {
  position: relative;
  min-height: 100vh;
  box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--environment-accent, #ef3150) 42%, white);
}

.dashboard-shell::before {
  content: "";
  position: fixed;
  inset: 0 0 auto 0;
  height: 4px;
  background: var(--environment-accent, #ef3150);
  z-index: 60;
}
```

- [ ] **Step 5: Run the frontend build**

Run: `npm run build`

Expected: PASS with generated `dist/assets/index-*.js` and no build errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/main.jsx frontend/src/styles.css
git commit -m "feat: add environment switcher and repository source flow"
```

### Task 6: Docs, smoke tests, and release verification

**Files:**

- Modify: `README.md`
- Modify: `README.zh.md`
- Test: backend and frontend full verification

- [ ] **Step 1: Update the English README**

Add these sections to `README.md`:

```md
## Environments

Candy supports multiple runtime environments such as `Production`, `Staging`, and `Test`.
Runners, Secrets, and deployment history are isolated per environment.

## Repository Reuse

Repository sources are global and reusable. A single repository source stores the Git URL and deployment key once, and each environment can attach its own deployment branch, work directory, Runner, Webhook secret, and deployment script.

## Webhook Format

Webhook URLs now use an opaque binding-level identifier:

`https://your-host/webhooks/{webhookId}`
```

- [ ] **Step 2: Update the Chinese README**

Add the equivalent sections to `README.zh.md`:

```md
## 环境

Candy 支持多个运行环境，例如 `Production`、`Staging`、`Test`。
Runner、Secret 与部署历史按环境隔离。

## 仓库复用

仓库源是全局可复用的。一个仓库源只保存一次 Git 地址和 deployment key，各环境再分别配置自己的分支、工作目录、Runner、Webhook secret 与部署脚本。

## Webhook 格式

Webhook 地址改为使用不可遍历的 binding 级 `webhookId`：

`https://your-host/webhooks/{webhookId}`
```

- [ ] **Step 3: Run backend tests**

Run: `env GOCACHE=/Users/ezmo/Projects/Private/candy/.cache/go-build GOMODCACHE=/Users/ezmo/Projects/Private/candy/.cache/gomod go test ./...`

Expected: PASS

- [ ] **Step 4: Run frontend build**

Run: `cd /Users/ezmo/Projects/Private/candy/frontend && npm run build`

Expected: PASS

- [ ] **Step 5: Run release packaging**

Run: `cd /Users/ezmo/Projects/Private/candy && make release`

Expected: PASS and regenerated archives in `dist/release/`

- [ ] **Step 6: Commit**

```bash
git add README.md README.zh.md dist/release
git commit -m "docs: describe environment-aware deployment model"
```

## Self-Review

- Spec coverage:
  Task 1 covers opaque IDs and new core types.
  Task 2 covers schema, migration, default environment creation, and repository split.
  Task 3 covers deployment lookup, secret isolation, and binding-level webhook resolution.
  Task 4 covers environment-aware APIs and public-ID-only routes.
  Task 5 covers environment switcher, environment framing color, and the new repository source plus binding UX.
  Task 6 covers documentation and full verification.

- Placeholder scan:
  No `TBD`, `TODO`, or deferred implementation placeholders remain in the tasks.

- Type consistency:
  The plan consistently uses `RepositorySource`, `EnvironmentRepository`, `public_id`, and `webhook_id` throughout.

