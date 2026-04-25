package candy

import (
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestStoreMigratesLegacyRunnerSchema(t *testing.T) {
	ctx := t.Context()
	dbPath := t.TempDir() + "/candy.db"
	box := NewSecretBox("test-secret")
	now := dbTime(time.Now())

	webhookCipher, err := box.Seal("webhook-secret")
	if err != nil {
		t.Fatal(err)
	}
	deployKeyCipher, err := box.Seal("deploy-key")
	if err != nil {
		t.Fatal(err)
	}
	privateKeyCipher, err := box.Seal("runner-key")
	if err != nil {
		t.Fatal(err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, statement := range []string{
		`CREATE TABLE agents (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			mode TEXT NOT NULL CHECK (mode IN ('local', 'ssh')),
			host TEXT NOT NULL DEFAULT '',
			port INTEGER NOT NULL DEFAULT 22,
			username TEXT NOT NULL DEFAULT '',
			work_root TEXT NOT NULL DEFAULT '',
			private_key_cipher TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE repositories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			provider TEXT NOT NULL DEFAULT 'github',
			repo_url TEXT NOT NULL,
			webhook_secret_cipher TEXT NOT NULL,
			branch TEXT NOT NULL,
			work_dir TEXT NOT NULL,
			deploy_key_cipher TEXT NOT NULL DEFAULT '',
			deploy_script TEXT NOT NULL,
			agent_id INTEGER NULL REFERENCES agents(id) ON DELETE SET NULL,
			clean_worktree INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE deploy_jobs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
			agent_id INTEGER NULL REFERENCES agents(id) ON DELETE SET NULL,
			provider TEXT NOT NULL,
			event TEXT NOT NULL,
			delivery_id TEXT NOT NULL DEFAULT '',
			branch TEXT NOT NULL,
			commit_sha TEXT NOT NULL DEFAULT '',
			commit_message TEXT NOT NULL DEFAULT '',
			commit_author TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'ignored')),
			exit_code INTEGER NULL,
			error TEXT NOT NULL DEFAULT '',
			triggered_at TEXT NOT NULL,
			started_at TEXT NULL,
			finished_at TEXT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE UNIQUE INDEX deploy_jobs_delivery_idx
			ON deploy_jobs(repository_id, delivery_id)
			WHERE delivery_id <> '';`,
		`CREATE INDEX deploy_jobs_status_idx ON deploy_jobs(status, id);`,
		`CREATE INDEX deploy_jobs_repository_idx ON deploy_jobs(repository_id, id);`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO agents (id, name, mode, host, port, username, work_root, private_key_cipher, created_at, updated_at)
		 VALUES (1, 'deploy-01', 'ssh', '192.0.2.10', 22, 'deploy', '/srv/apps', ?, ?, ?)`,
		privateKeyCipher, now, now,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO repositories
		 (id, name, provider, repo_url, webhook_secret_cipher, branch, work_dir, deploy_key_cipher, deploy_script, agent_id, clean_worktree, created_at, updated_at)
		 VALUES (1, 'api', 'github', 'git@example.com:org/api.git', ?, 'main', '/srv/api', ?, 'echo deploy', 1, 1, ?, ?)`,
		webhookCipher, deployKeyCipher, now, now,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO deploy_jobs
		 (id, repository_id, agent_id, provider, event, delivery_id, branch, commit_sha, commit_message, commit_author,
		  status, exit_code, error, triggered_at, started_at, finished_at, created_at)
		 VALUES (1, 1, 1, 'github', 'push', 'delivery-1', 'main', 'abcdef', 'commit', 'dev',
		  'succeeded', 0, '', ?, ?, ?, ?)`,
		now, now, now, now,
	); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	store, err := NewStore(ctx, Config{
		DBPath:        dbPath,
		PublicURL:     "http://localhost",
		AdminUsername: "super_admin",
		AdminPassword: "admin123",
	}, box)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	runners, err := store.ListRunners(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(runners) != 1 || runners[0].Name != "deploy-01" {
		t.Fatalf("runners = %#v", runners)
	}
	repos, err := store.ListRepositories(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(repos) != 1 || repos[0].RunnerID == nil || *repos[0].RunnerID != 1 {
		t.Fatalf("repos = %#v", repos)
	}
	jobs, err := store.ListJobs(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(jobs) != 1 || jobs[0].RunnerID == nil || *jobs[0].RunnerID != 1 {
		t.Fatalf("jobs = %#v", jobs)
	}
	if exists, err := store.tableExists(ctx, "agents"); err != nil || exists {
		t.Fatalf("legacy table exists=%v err=%v", exists, err)
	}
	if hasColumn, err := store.tableHasColumn(ctx, "repositories", "agent_id"); err != nil || hasColumn {
		t.Fatalf("repositories.agent_id exists=%v err=%v", hasColumn, err)
	}
	if hasColumn, err := store.tableHasColumn(ctx, "deploy_jobs", "agent_id"); err != nil || hasColumn {
		t.Fatalf("deploy_jobs.agent_id exists=%v err=%v", hasColumn, err)
	}
}

func TestMigrateCreatesDefaultEnvironmentAndRepositorySplit(t *testing.T) {
	ctx := t.Context()
	dbPath := t.TempDir() + "/candy.db"
	box := NewSecretBox("test-secret")
	now := dbTime(time.Now())

	webhookCipher, err := box.Seal("webhook-secret")
	if err != nil {
		t.Fatal(err)
	}
	deployKeyCipher, err := box.Seal("deploy-key")
	if err != nil {
		t.Fatal(err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if _, err := db.ExecContext(ctx, `CREATE TABLE repositories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		provider TEXT NOT NULL DEFAULT 'github',
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
	);`); err != nil {
		t.Fatal(err)
	}

	if _, err := db.ExecContext(ctx,
		`INSERT INTO repositories
		 (name, provider, repo_url, webhook_secret_cipher, branch, work_dir, deploy_key_cipher, deploy_script, runner_id, clean_worktree, created_at, updated_at)
		 VALUES ('api', 'github', 'git@example.com:org/api.git', ?, 'main', '/srv/api', ?, 'echo deploy', NULL, 1, ?, ?)`,
		webhookCipher, deployKeyCipher, now, now,
	); err != nil {
		t.Fatal(err)
	}

	store := &Store{
		db:        db,
		box:       box,
		publicURL: "http://localhost",
	}
	if err := store.migrate(ctx); err != nil {
		t.Fatal(err)
	}

	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM environments`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("environments count = %d, want 2", count)
	}

	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM repository_sources`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("repository_sources count = %d, want 1", count)
	}

	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM environment_repositories`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("environment_repositories count = %d, want 1", count)
	}

	var webhookID string
	if err := db.QueryRowContext(ctx, `SELECT webhook_id FROM environment_repositories LIMIT 1`).Scan(&webhookID); err != nil {
		t.Fatal(err)
	}
	if webhookID == "" {
		t.Fatal("environment_repositories webhook_id = empty, want non-empty")
	}

	var legacyRepositoryID sql.NullInt64
	if err := db.QueryRowContext(ctx, `SELECT legacy_repository_id FROM environment_repositories LIMIT 1`).Scan(&legacyRepositoryID); err != nil {
		t.Fatal(err)
	}
	if !legacyRepositoryID.Valid {
		t.Fatal("environment_repositories legacy_repository_id is NULL, want populated")
	}

	if err := store.migrate(ctx); err != nil {
		t.Fatal(err)
	}

	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM environments`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("environments count after rerun = %d, want 2", count)
	}

	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM repository_sources`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("repository_sources count after rerun = %d, want 1", count)
	}

	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM environment_repositories`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("environment_repositories count after rerun = %d, want 1", count)
	}
}

func TestMigrateRepositorySplitHandlesDuplicateLegacyNames(t *testing.T) {
	ctx := t.Context()
	dbPath := t.TempDir() + "/candy.db"
	box := NewSecretBox("test-secret")
	now := dbTime(time.Now())

	firstWebhookCipher, err := box.Seal("webhook-secret-1")
	if err != nil {
		t.Fatal(err)
	}
	firstDeployKeyCipher, err := box.Seal("deploy-key-1")
	if err != nil {
		t.Fatal(err)
	}
	secondWebhookCipher, err := box.Seal("webhook-secret-2")
	if err != nil {
		t.Fatal(err)
	}
	secondDeployKeyCipher, err := box.Seal("deploy-key-2")
	if err != nil {
		t.Fatal(err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if _, err := db.ExecContext(ctx, `CREATE TABLE repositories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		provider TEXT NOT NULL DEFAULT 'github',
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
	);`); err != nil {
		t.Fatal(err)
	}

	if _, err := db.ExecContext(ctx,
		`INSERT INTO repositories
		 (name, provider, repo_url, webhook_secret_cipher, branch, work_dir, deploy_key_cipher, deploy_script, runner_id, clean_worktree, created_at, updated_at)
		 VALUES ('api', 'github', 'git@example.com:org/api-a.git', ?, 'main', '/srv/api-a', ?, 'echo deploy-a', NULL, 1, ?, ?)`,
		firstWebhookCipher, firstDeployKeyCipher, now, now,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO repositories
		 (name, provider, repo_url, webhook_secret_cipher, branch, work_dir, deploy_key_cipher, deploy_script, runner_id, clean_worktree, created_at, updated_at)
		 VALUES ('api', 'github', 'git@example.com:org/api-b.git', ?, 'main', '/srv/api-b', ?, 'echo deploy-b', NULL, 1, ?, ?)`,
		secondWebhookCipher, secondDeployKeyCipher, now, now,
	); err != nil {
		t.Fatal(err)
	}

	store := &Store{
		db:        db,
		box:       box,
		publicURL: "http://localhost",
	}
	if err := store.migrate(ctx); err != nil {
		t.Fatal(err)
	}

	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM repository_sources`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("repository_sources count = %d, want 2", count)
	}

	rows, err := db.QueryContext(ctx, `SELECT name FROM repository_sources ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	names := make([]string, 0, 2)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}

	if len(names) != 2 {
		t.Fatalf("repository source names = %#v, want 2 rows", names)
	}
	if names[0] != "api" {
		t.Fatalf("first repository source name = %q, want api", names[0])
	}
	if names[1] != "api-2" {
		t.Fatalf("second repository source name = %q, want api-2", names[1])
	}
}

func TestMigrateRepositorySplitHandlesDuplicateLegacyNamesDuringRepositorySourcesRebuild(t *testing.T) {
	ctx := t.Context()
	dbPath := t.TempDir() + "/candy.db"
	box := NewSecretBox("test-secret")
	now := dbTime(time.Now())

	db, err := sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if _, err := db.ExecContext(ctx, `CREATE TABLE repository_sources (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		public_id TEXT NOT NULL UNIQUE,
		name TEXT NOT NULL,
		provider TEXT NOT NULL DEFAULT 'github',
		repo_url TEXT NOT NULL,
		deploy_key_cipher TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`); err != nil {
		t.Fatal(err)
	}

	if _, err := db.ExecContext(ctx,
		`INSERT INTO repository_sources
		 (id, public_id, name, provider, repo_url, deploy_key_cipher, created_at, updated_at)
		 VALUES
		 (1, 'src_first', 'api', 'github', 'git@example.com:org/api-a.git', '', ?, ?),
		 (2, 'src_second', 'api', 'github', 'git@example.com:org/api-b.git', '', ?, ?)`,
		now, now, now, now,
	); err != nil {
		t.Fatal(err)
	}

	store := &Store{
		db:        db,
		box:       box,
		publicURL: "http://localhost",
	}
	if err := store.migrate(ctx); err != nil {
		t.Fatal(err)
	}

	rows, err := db.QueryContext(ctx, `SELECT name FROM repository_sources ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	names := make([]string, 0, 2)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}

	if len(names) != 2 {
		t.Fatalf("repository source names after rebuild = %#v, want 2 rows", names)
	}
	if names[0] != "api" {
		t.Fatalf("first rebuilt repository source name = %q, want api", names[0])
	}
	if names[1] != "api-2" {
		t.Fatalf("second rebuilt repository source name = %q, want api-2", names[1])
	}
}

func TestMigrateCreatesDefaultEnvironmentAndRepositorySplitRepairsEmptyWebhookID(t *testing.T) {
	ctx := t.Context()
	dbPath := t.TempDir() + "/candy.db"
	box := NewSecretBox("test-secret")
	now := dbTime(time.Now())

	webhookCipher, err := box.Seal("webhook-secret")
	if err != nil {
		t.Fatal(err)
	}
	deployKeyCipher, err := box.Seal("deploy-key")
	if err != nil {
		t.Fatal(err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	for _, statement := range []string{
		`CREATE TABLE environments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			public_id TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL UNIQUE,
			slug TEXT NOT NULL UNIQUE,
			description TEXT NOT NULL DEFAULT '',
			color TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE repository_sources (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			public_id TEXT NOT NULL UNIQUE,
			name TEXT NOT NULL UNIQUE,
			provider TEXT NOT NULL DEFAULT 'github',
			repo_url TEXT NOT NULL,
			deploy_key_cipher TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE repositories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			provider TEXT NOT NULL DEFAULT 'github',
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
		);`,
		`CREATE TABLE environment_repositories (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			public_id TEXT NOT NULL UNIQUE,
			environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
			repository_source_id INTEGER NOT NULL REFERENCES repository_sources(id) ON DELETE CASCADE,
			legacy_repository_id INTEGER NULL UNIQUE,
			webhook_secret_cipher TEXT NOT NULL,
			webhook_id TEXT NOT NULL UNIQUE DEFAULT '',
			branch TEXT NOT NULL,
			work_dir TEXT NOT NULL,
			deploy_script TEXT NOT NULL,
			runner_id INTEGER NULL,
			clean_worktree INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			UNIQUE(environment_id, repository_source_id)
		);`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	if _, err := db.ExecContext(ctx,
		`INSERT INTO environments
		 (id, public_id, name, slug, description, color, created_at, updated_at)
		 VALUES (1, 'env_prod', 'Production', 'production', '', '#D83B53', ?, ?)`,
		now, now,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO repository_sources
		 (id, public_id, name, provider, repo_url, deploy_key_cipher, created_at, updated_at)
		 VALUES (1, 'src_api', 'api', 'github', 'git@example.com:org/api.git', ?, ?, ?)`,
		deployKeyCipher, now, now,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO repositories
		 (id, name, provider, repo_url, webhook_secret_cipher, branch, work_dir, deploy_key_cipher, deploy_script, runner_id, clean_worktree, created_at, updated_at)
		 VALUES (1, 'api', 'github', 'git@example.com:org/api.git', ?, 'main', '/srv/api', ?, 'echo deploy', NULL, 1, ?, ?)`,
		webhookCipher, deployKeyCipher, now, now,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO environment_repositories
		 (id, public_id, environment_id, repository_source_id, legacy_repository_id, webhook_secret_cipher, webhook_id, branch, work_dir, deploy_script, runner_id, clean_worktree, created_at, updated_at)
		 VALUES (1, 'repo_api', 1, 1, 1, ?, '', 'main', '/srv/api', 'echo deploy', NULL, 1, ?, ?)`,
		webhookCipher, now, now,
	); err != nil {
		t.Fatal(err)
	}

	store := &Store{
		db:        db,
		box:       box,
		publicURL: "http://localhost",
	}
	if err := store.migrate(ctx); err != nil {
		t.Fatal(err)
	}

	var webhookID string
	if err := db.QueryRowContext(ctx, `SELECT webhook_id FROM environment_repositories WHERE id = 1`).Scan(&webhookID); err != nil {
		t.Fatal(err)
	}
	if webhookID == "" {
		t.Fatal("repaired environment_repositories webhook_id = empty, want non-empty")
	}

	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM environment_repositories`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("environment_repositories count after repair = %d, want 1", count)
	}
}
