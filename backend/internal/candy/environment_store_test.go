package candy

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestNewPublicIDProducesOpaqueURLSafeValue(t *testing.T) {
	first, err := newPublicID("env")
	if err != nil {
		t.Fatalf("newPublicID returned error: %v", err)
	}

	second, err := newPublicID("env")
	if err != nil {
		t.Fatalf("newPublicID returned error: %v", err)
	}

	if first == second {
		t.Fatal("expected generated public IDs to differ")
	}

	opaqueFirst, ok := strings.CutPrefix(first, "env_")
	if !ok {
		t.Fatalf("expected env_ prefix, got %q", first)
	}

	if len(opaqueFirst) != 20 {
		t.Fatalf("expected opaque segment length 20, got %d", len(opaqueFirst))
	}

	if len(first) != len("env_")+20 {
		t.Fatalf("expected total length %d, got %d", len("env_")+20, len(first))
	}

	for _, r := range opaqueFirst {
		if (r < '0' || r > '9') && (r < 'a' || r > 'z') {
			t.Fatalf("expected lowercase base36 rune, got %q", r)
		}
	}
}

func TestDeploymentSecretsStayWithinEnvironmentRepository(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)

	envA, err := mustEnvironmentBySlug(ctx, store, "production")
	if err != nil {
		t.Fatalf("mustEnvironmentBySlug(production) error = %v", err)
	}
	envB, err := store.CreateEnvironment(ctx, Environment{Name: "Staging", Slug: "staging", Color: "#2C99F0"})
	if err != nil {
		t.Fatalf("CreateEnvironment(staging) error = %v", err)
	}

	source, err := store.CreateRepositorySource(ctx, RepositorySource{
		Name:      "frontend",
		Provider:  "github",
		RepoURL:   "git@github.com:org/frontend.git",
		DeployKey: "KEY",
	})
	if err != nil {
		t.Fatalf("CreateRepositorySource() error = %v", err)
	}

	repoA, err := store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentKey: envA.PublicID,
		SourceKey:      source.PublicID,
		Branch:         "main",
		WorkDir:        "/srv/prod",
		DeployScript:   "echo prod",
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository(prod) error = %v", err)
	}
	repoB, err := store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentKey: envB.PublicID,
		SourceKey:      source.PublicID,
		Branch:         "develop",
		WorkDir:        "/srv/staging",
		DeployScript:   "echo staging",
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository(staging) error = %v", err)
	}

	prodRepositoryID := mustLegacyRepositoryIDForEnvironmentRepository(t, store, repoA.PublicID)
	stagingRepositoryID := mustLegacyRepositoryIDForEnvironmentRepository(t, store, repoB.PublicID)

	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "prod-token", RepositoryID: &prodRepositoryID}); err != nil {
		t.Fatalf("CreateSecret(prod) error = %v", err)
	}
	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "staging-token", RepositoryID: &stagingRepositoryID}); err != nil {
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

func TestNewStoreEnsuresProductionAndTestingEnvironments(t *testing.T) {
	ctx := context.Background()
	store := newTestStore(t)

	environments, err := store.ListEnvironments(ctx)
	if err != nil {
		t.Fatalf("ListEnvironments() error = %v", err)
	}

	bySlug := map[string]Environment{}
	for _, environment := range environments {
		bySlug[environment.Slug] = environment
	}

	production, ok := bySlug["production"]
	if !ok {
		t.Fatal("expected production environment to exist")
	}
	if production.Name != "Production" {
		t.Fatalf("production name = %q, want %q", production.Name, "Production")
	}
	if production.Color != "#D83B53" {
		t.Fatalf("production color = %q, want %q", production.Color, "#D83B53")
	}

	testingEnv, ok := bySlug["testing"]
	if !ok {
		t.Fatal("expected testing environment to exist")
	}
	if testingEnv.Name != "Testing" {
		t.Fatalf("testing name = %q, want %q", testingEnv.Name, "Testing")
	}
	if testingEnv.Color != "#1F8E5E" {
		t.Fatalf("testing color = %q, want %q", testingEnv.Color, "#1F8E5E")
	}
}

func mustLegacyRepositoryIDForEnvironmentRepository(t *testing.T, store *Store, publicID string) int64 {
	t.Helper()

	var repositoryID sql.NullInt64
	err := store.db.QueryRowContext(
		context.Background(),
		`SELECT legacy_repository_id
		 FROM environment_repositories
		 WHERE public_id = ?`,
		publicID,
	).Scan(&repositoryID)
	if err != nil {
		t.Fatalf("legacy_repository_id lookup error = %v", err)
	}
	if !repositoryID.Valid {
		t.Fatal("legacy_repository_id = NULL, want populated")
	}
	return repositoryID.Int64
}

func mustEnvironmentBySlug(ctx context.Context, store *Store, slug string) (Environment, error) {
	environments, err := store.ListEnvironments(ctx)
	if err != nil {
		return Environment{}, err
	}
	for _, environment := range environments {
		if environment.Slug == slug {
			return environment, nil
		}
	}
	return Environment{}, sql.ErrNoRows
}
