package candy

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestNewOpaqueIDProducesOpaqueURLSafeValue(t *testing.T) {
	first, err := newOpaqueID("env")
	if err != nil {
		t.Fatalf("newOpaqueID returned error: %v", err)
	}

	second, err := newOpaqueID("env")
	if err != nil {
		t.Fatalf("newOpaqueID returned error: %v", err)
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
		EnvironmentID:      envA.ID,
		RepositorySourceID: source.ID,
		Branch:             "main",
		WorkDir:            "/srv/prod",
		DeployScript:       "echo prod",
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository(prod) error = %v", err)
	}
	repoB, err := store.CreateEnvironmentRepository(ctx, EnvironmentRepository{
		EnvironmentID:      envB.ID,
		RepositorySourceID: source.ID,
		Branch:             "develop",
		WorkDir:            "/srv/staging",
		DeployScript:       "echo staging",
	})
	if err != nil {
		t.Fatalf("CreateEnvironmentRepository(staging) error = %v", err)
	}

	prodRepository, err := store.getEnvironmentRepositoryRecordByResourceID(ctx, repoA.ID, false)
	if err != nil {
		t.Fatalf("getEnvironmentRepositoryRecordByResourceID(prod) error = %v", err)
	}
	stagingRepository, err := store.getEnvironmentRepositoryRecordByResourceID(ctx, repoB.ID, false)
	if err != nil {
		t.Fatalf("getEnvironmentRepositoryRecordByResourceID(staging) error = %v", err)
	}

	prodRepositoryID := prodRepository.InternalID
	stagingRepositoryID := stagingRepository.InternalID
	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "prod-token", EnvironmentID: envA.InternalID, EnvironmentRepositoryID: &prodRepositoryID}); err != nil {
		t.Fatalf("CreateSecret(prod) error = %v", err)
	}
	if _, err := store.CreateSecret(ctx, Secret{Name: "API_TOKEN", Value: "staging-token", EnvironmentID: envB.InternalID, EnvironmentRepositoryID: &stagingRepositoryID}); err != nil {
		t.Fatalf("CreateSecret(staging) error = %v", err)
	}

	secrets, err := store.DeploymentSecrets(ctx, repoA.ID)
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
