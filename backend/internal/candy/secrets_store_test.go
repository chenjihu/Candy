package candy

import (
	"context"
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
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
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestDeploymentSecretsRepositoryOverridesGlobal(t *testing.T) {
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
		CleanWorktree:  true,
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository() error = %v", err)
	}
	legacyRepositoryID := mustLegacyRepositoryIDForEnvironmentRepository(t, store, repo.PublicID)

	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "global"}); err != nil {
		t.Fatalf("CreateSecret(global) error = %v", err)
	}
	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "repo", RepositoryID: &legacyRepositoryID}); err != nil {
		t.Fatalf("CreateSecret(repo) error = %v", err)
	}

	secrets, err := store.DeploymentSecrets(ctx, repo.PublicID)
	if err != nil {
		t.Fatalf("DeploymentSecrets() error = %v", err)
	}
	if len(secrets) != 1 {
		t.Fatalf("DeploymentSecrets() length = %d, want 1", len(secrets))
	}
	if secrets[0].Name != "API_TOKEN" || secrets[0].Value != "repo" {
		t.Fatalf("DeploymentSecrets()[0] = %#v, want repo override", secrets[0])
	}
}

func TestValidateSecretName(t *testing.T) {
	if err := validateSecret(Secret{Name: "DATABASE_URL", Value: "postgres://example"}, true); err != nil {
		t.Fatalf("validateSecret() error = %v", err)
	}
	if err := validateSecret(Secret{Name: "database-url", Value: "bad"}, true); err == nil {
		t.Fatal("validateSecret() error = nil, want invalid name error")
	}
}
