package candy

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

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

	mustHaveTable("users")
	mustHaveTable("runners")
	mustHaveTable("environments")
	mustHaveTable("repository_sources")
	mustHaveTable("environment_repositories")
	mustHaveTable("secrets")
	mustHaveTable("deploy_jobs")
	mustHaveTable("job_logs")
}

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
		t.Fatalf("PRAGMA table_info(environment_repositories) error = %v", err)
	}
	defer rows.Close()

	columns := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			t.Fatalf("Scan() error = %v", err)
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("rows.Err() = %v", err)
	}

	expectedEnvironmentRepositoryColumns := map[string]bool{
		"id":                    true,
		"public_id":             true,
		"environment_id":        true,
		"repository_source_id":  true,
		"webhook_secret_cipher": true,
		"webhook_id":            true,
		"branch":                true,
		"work_dir":              true,
		"deploy_script":         true,
		"runner_id":             true,
		"clean_worktree":        true,
		"created_at":            true,
		"updated_at":            true,
	}
	if len(columns) != len(expectedEnvironmentRepositoryColumns) {
		t.Fatalf("environment_repositories columns = %#v, want %#v", columns, expectedEnvironmentRepositoryColumns)
	}
	for name := range columns {
		if !expectedEnvironmentRepositoryColumns[name] {
			t.Fatalf("unexpected environment_repositories column %q", name)
		}
	}

	rows, err = store.db.QueryContext(ctx, `PRAGMA table_info(secrets)`)
	if err != nil {
		t.Fatalf("PRAGMA table_info(secrets) error = %v", err)
	}
	defer rows.Close()

	secretColumns := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			t.Fatalf("Scan() error = %v", err)
		}
		secretColumns[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("rows.Err() = %v", err)
	}

	if !secretColumns["environment_id"] || !secretColumns["environment_repository_id"] {
		t.Fatalf("secrets columns = %#v, want environment_id and environment_repository_id", secretColumns)
	}
	if len(secretColumns) != 7 {
		t.Fatalf("secrets columns = %#v, want 7 columns", secretColumns)
	}
}
